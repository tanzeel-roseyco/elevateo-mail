> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# SSH into Devin Cloud sessions

> Connect to a Devin Cloud session's VM over SSH with devin ssh, forward ports with devin forward, and copy files with scp from the Devin CLI.

Every [Devin Cloud](/cli/cloud) session runs on a VM with the repository cloned and the environment set up. SSH in to explore or edit the code, run dev servers and forward their ports, or copy files with `scp`.

## Connect

`devin ssh` opens a shell on the VM. It wraps the system `ssh` and approves the connection with your logged-in credentials:

```bash theme={null}
devin ssh <session-id-or-url>                          # open a shell
devin ssh <session-id-or-url> -L 8080:localhost:8080   # extra options pass through to ssh
devin ssh                                              # pick from recent sessions
```

Inside a cloud session, `/ssh` does the same for the current session.

Plain `ssh` also works, from any SSH client (`scp`, your editor's remote-SSH extension). The gateway prints a URL to approve the connection in your browser:

```bash theme={null}
ssh devin-<id>@ssh.devin.ai
scp devin-<id>@ssh.devin.ai:~/repos/app/report.html .
```

## Forward ports

`devin forward` forwards a VM port to `localhost` until you press Ctrl-C:

```bash theme={null}
devin forward <session-id-or-url> 3000        # http://localhost:3000
devin forward <session-id-or-url> 8080:3000   # local 8080 → VM 3000
```

## Related resources

<CardGroup cols={2}>
  <Card title="Cloud CLI" icon="cloud" href="/cli/cloud">
    Create, steer, and resume cloud sessions from the terminal
  </Card>

  <Card title="Commands & Flags" icon="terminal" href="/cli/reference/commands#devin-ssh">
    Full reference for `devin ssh` and `devin forward`
  </Card>
</CardGroup>


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.