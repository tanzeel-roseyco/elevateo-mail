FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
# AIDEV-NOTE: The SSH daemon is isolated from host credentials, Docker and the private database network.
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssh-server \
 && rm -rf /var/lib/apt/lists/* /etc/ssh/ssh_host_* \
 && useradd --no-create-home --user-group --home-dir /nonexistent --shell /usr/sbin/nologin --password '*' forward
COPY ops/railway/sshd_config /etc/ssh/elevateo_sshd_config
EXPOSE 2222
ENTRYPOINT ["/usr/sbin/sshd", "-D", "-e", "-f", "/etc/ssh/elevateo_sshd_config"]
