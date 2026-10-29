use crate::protocol::{Error, Runtime};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::process::{Child, Command};
use url::Url;
use uuid::Uuid;

// AIDEV-NOTE: Trusted native configuration only; no request can select binaries, images, mounts or origins.
#[derive(Clone)]
pub struct Config {
    pub docker: PathBuf,
    pub image: String,
    pub mcp_url: Url,
}
impl Config {
    pub fn validate(&self) -> Result<(), Error> {
        let digest = self.image.rsplit_once("@sha256:").or_else(|| {
            self.image
                .strip_prefix("sha256:")
                .map(|hash| ("local", hash))
        });
        if !self.docker.is_absolute()
            || !self.docker.is_file()
            || !digest.is_some_and(|(name, hash)| {
                !name.is_empty()
                    && !name.starts_with('-')
                    && !name.chars().any(char::is_whitespace)
                    && hash.len() == 64
                    && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            })
            || self.mcp_url.scheme() != "https"
            || self.mcp_url.host_str().is_none()
            || !self.mcp_url.username().is_empty()
            || self.mcp_url.password().is_some()
            || self.mcp_url.port_or_known_default() != Some(443)
            || self.mcp_url.query().is_some()
            || self.mcp_url.fragment().is_some()
        {
            return Err(Error::InvalidInput);
        }
        Ok(())
    }
    fn command(&self) -> Command {
        let mut command = Command::new(&self.docker);
        // AIDEV-NOTE: Never inherit DOCKER_CONTEXT/HOST: fleet and other remote daemons are prohibited.
        command.env_clear();
        #[cfg(windows)]
        if let Some(root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", root);
        }
        let host = if cfg!(windows) {
            "npipe:////./pipe/docker_engine"
        } else {
            "unix:///var/run/docker.sock"
        };
        command
            .args(["--host", host])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        command
    }
    async fn status(&self, args: &[&str]) -> Result<(), Error> {
        let status =
            tokio::time::timeout(Duration::from_secs(15), self.command().args(args).status())
                .await
                .map_err(|_| Error::TemporarilyUnavailable)?
                .map_err(|_| Error::TemporarilyUnavailable)?;
        if status.success() {
            Ok(())
        } else {
            Err(Error::TemporarilyUnavailable)
        }
    }
}

pub(crate) struct Sandbox {
    config: Config,
    agent: String,
    proxy: String,
    network: String,
}
impl Sandbox {
    pub fn new(config: Config, id: Uuid) -> Self {
        Self {
            config,
            agent: format!("elevateo-agent-{id}"),
            proxy: format!("elevateo-egress-{id}"),
            network: format!("elevateo-isolated-{id}"),
        }
    }
    pub async fn prepare(&self, runtime: Runtime) -> Result<(), Error> {
        self.config
            .status(&["image", "inspect", &self.config.image])
            .await?;
        self.config
            .status(&[
                "network",
                "create",
                "--internal",
                "--label",
                "elevateo.agent=true",
                &self.network,
            ])
            .await?;
        let provider = match runtime {
            Runtime::Codex => "api.openai.com",
            Runtime::Claude => "api.anthropic.com",
        };
        let allowed = format!(
            "{provider},{}",
            self.config.mcp_url.host_str().ok_or(Error::InvalidInput)?
        );
        self.config
            .status(&[
                "run",
                "-d",
                "--pull=never",
                "--name",
                &self.proxy,
                "--label",
                "elevateo.agent=true",
                "--read-only",
                "--cap-drop=ALL",
                "--security-opt=no-new-privileges",
                "--user=10001:10001",
                "--pids-limit=32",
                "--memory=64m",
                "--cpus=0.25",
                "--log-driver=none",
                "--init",
                "--entrypoint=python3",
                &self.config.image,
                "/opt/elevateo/proxy.py",
                &allowed,
            ])
            .await?;
        self.config
            .status(&[
                "network",
                "connect",
                "--alias",
                "egress",
                &self.network,
                &self.proxy,
            ])
            .await?;
        self.config
            .status(&[
                "create",
                "-i",
                "--pull=never",
                "--name",
                &self.agent,
                "--label",
                "elevateo.agent=true",
                "--network",
                &self.network,
                "--read-only",
                "--cap-drop=ALL",
                "--security-opt=no-new-privileges",
                "--user=10001:10001",
                "--pids-limit=128",
                "--memory=512m",
                "--cpus=1",
                "--log-driver=none",
                "--init",
                "--tmpfs=/home/agent:rw,noexec,nosuid,size=16m,uid=10001,gid=10001",
                "--tmpfs=/tmp:rw,noexec,nosuid,size=16m,uid=10001,gid=10001",
                "--tmpfs=/workspace:rw,noexec,nosuid,size=1m,uid=10001,gid=10001",
                "--workdir=/workspace",
                "--entrypoint=python3",
                &self.config.image,
                "/opt/elevateo/launch.py",
            ])
            .await
    }
    pub fn spawn(&self) -> Result<Child, Error> {
        self.config
            .command()
            .args(["start", "-a", "-i", &self.agent])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|_| Error::TemporarilyUnavailable)
    }
    pub async fn cleanup(&self) -> Result<(), Error> {
        // AIDEV-NOTE: A cancel is successful only after Docker kills the complete container process tree.
        // Inspect-all verifies absence without interpreting a daemon outage as successful removal.
        for name in [&self.agent, &self.proxy] {
            let _removed = self.config.status(&["rm", "-f", name]).await;
            let output = tokio::time::timeout(
                Duration::from_secs(15),
                self.config
                    .command()
                    .args([
                        "ps",
                        "-a",
                        "--filter",
                        &format!("name=^/{name}$"),
                        "--format",
                        "{{.Names}}",
                    ])
                    .stdout(Stdio::piped())
                    .output(),
            )
            .await
            .map_err(|_| Error::TemporarilyUnavailable)?
            .map_err(|_| Error::TemporarilyUnavailable)?;
            if !output.status.success() || !output.stdout.is_empty() {
                return Err(Error::TemporarilyUnavailable);
            }
        }
        // A failed preparation might never create the network. Verify absence rather than trusting rm's status.
        let _removed = self.config.status(&["network", "rm", &self.network]).await;
        let output = tokio::time::timeout(
            Duration::from_secs(15),
            self.config
                .command()
                .args([
                    "network",
                    "ls",
                    "--filter",
                    &format!("name=^{}$", self.network),
                    "--format",
                    "{{.Name}}",
                ])
                .stdout(Stdio::piped())
                .output(),
        )
        .await
        .map_err(|_| Error::TemporarilyUnavailable)?
        .map_err(|_| Error::TemporarilyUnavailable)?;
        if output.status.success() && output.stdout.is_empty() {
            Ok(())
        } else {
            Err(Error::TemporarilyUnavailable)
        }
    }
}
