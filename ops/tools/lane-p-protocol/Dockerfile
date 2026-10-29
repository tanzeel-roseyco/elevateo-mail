FROM --platform=linux/amd64 ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
# AIDEV-NOTE: Separate Lane P tools; frozen sources are mounted read-only only at runtime, without a Docker socket.
RUN test "$(dpkg --print-architecture)" = amd64 \
 && rm /etc/apt/sources.list.d/debian.sources \
 && printf '%s\n' \
 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20261010T000000Z bookworm main' \
 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/20261010T000000Z bookworm-security main' \
 > /etc/apt/sources.list \
 && apt-get -o Acquire::Retries=2 -o Acquire::https::Timeout=30 update \
 && apt-get -o Acquire::Retries=2 -o Acquire::https::Timeout=30 install -y --no-install-recommends \
 bash coreutils grep ca-certificates libicu72 libssl3 libgssapi-krb5-2 libstdc++6 zlib1g \
 && rm -rf /var/lib/apt/lists/*
# AIDEV-NOTE: BuildKit verifies release bytes before extraction; no mutable latest tag or install script.
ADD --checksum=sha256:ed8008345c7f5337f5e293145f5e243ce132e5ee4dfc24ac551c45a4b3092181 https://github.com/PowerShell/PowerShell/releases/download/v7.4.20/powershell-7.4.20-linux-x64.tar.gz /tmp/pwsh.tar.gz
ADD --checksum=sha256:153ea36d1d987a62942382b61075745042a2b3123b1cd48f4c3675af9cc7d6f1 https://rubygems.org/downloads/minitest-6.0.6.gem /tmp/minitest-6.0.6.gem
ADD --checksum=sha256:7040ed7185417a966920987eaa6eaf1be4ea1fc5b25bb03ff4703f98564a55b0 https://rubygems.org/downloads/minitest-mock-5.27.0.gem /tmp/minitest-mock-5.27.0.gem
ADD --checksum=sha256:27337aeabad6ffae05c265c450490628ef3ebd4b67be58257393227588f5a97b https://rubygems.org/downloads/base64-0.3.0.gem /tmp/base64-0.3.0.gem
RUN mkdir -p /opt/microsoft/powershell/7 \
 && tar -xzf /tmp/pwsh.tar.gz -C /opt/microsoft/powershell/7 \
 && chmod 755 /opt/microsoft/powershell/7/pwsh \
 && ln -s /opt/microsoft/powershell/7/pwsh /usr/local/bin/pwsh \
 && gem install --local --no-document /tmp/minitest-6.0.6.gem /tmp/minitest-mock-5.27.0.gem /tmp/base64-0.3.0.gem \
 && rm /tmp/pwsh.tar.gz /tmp/minitest-6.0.6.gem /tmp/minitest-mock-5.27.0.gem /tmp/base64-0.3.0.gem
ENV HOME=/tmp DOTNET_CLI_HOME=/tmp TMPDIR=/tmp POWERSHELL_TELEMETRY_OPTOUT=1 POWERSHELL_UPDATECHECK=Off
COPY checks.sh gems.rb /opt/lane-p/
RUN chmod 444 /opt/lane-p/checks.sh /opt/lane-p/gems.rb
ENV RUBYOPT=-r/opt/lane-p/gems.rb
USER 10001:10001
WORKDIR /src
ENTRYPOINT ["bash", "/opt/lane-p/checks.sh"]
