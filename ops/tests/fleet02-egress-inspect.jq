# AIDEV-NOTE: Gate start/removal against the intended profile, never ownership labels alone.
def require($ok): if $ok then . else error("lane resource verification failed") end;
def mounts:
  [.Mounts[] | {type: .Type, source: (if .Type == "tmpfs" then "" else .Source end),
               target: .Destination, rw: .RW}] | sort_by(.target);
.[0] as $c | $spec[0] as $s |
require(length == 1) |
require($c.Name == ("/" + $s.name) and $c.Config.Labels["elevateo.lane"] == $task) |
require($c.Image == $s.image) |
require($c.Id | test("^[0-9a-f]{64}$")) |
require($c.HostConfig.NanoCpus == $s.cpus and $c.HostConfig.Memory == $s.memory and
        $c.HostConfig.MemorySwap == $s.memory and $c.HostConfig.PidsLimit == 256) |
require($c.HostConfig.Privileged == false and ($c.HostConfig.CapAdd // [] | length) == 0 and
        ($c.HostConfig.Devices // [] | length) == 0 and ($c.HostConfig.DeviceRequests // [] | length) == 0) |
require($c.HostConfig.NetworkMode == $s.network and $c.HostConfig.ReadonlyRootfs == $s.readonly and
        $c.Config.User == $s.user and ($c.HostConfig.Tmpfs // {}) == {}) |
require(($c | mounts) == ($s.mounts | sort_by(.target))) |
require(([$c.HostConfig.Mounts[]? | select(.Type == "tmpfs") |
          {target:.Target,size:.TmpfsOptions.SizeBytes}] | sort_by(.target)) ==
        (($s.tmpfs // []) | sort_by(.target))) |
require(($s.hardened != true) or
        (($c.HostConfig.CapDrop | sort) == ["ALL"] and
         ($c.HostConfig.SecurityOpt | sort) == ["no-new-privileges"])) |
require($c.Config.Cmd == $s.command and $c.Config.Entrypoint == $s.entrypoint) |
require(($c.HostConfig.PortBindings // {}) == ($s.ports // {})) |
require($c.HostConfig.RestartPolicy.Name == "no") |
require(($c.NetworkSettings.Networks | keys) == $s.networks) |
require(($s.service == null) or
        ($c.Config.Labels["com.docker.compose.project"] == $task and
         $c.Config.Labels["com.docker.compose.service"] == $s.service)) |
# AIDEV-NOTE: Docker start can serialize OomKillDisable false as null; both keep the OOM killer enabled.
require($c.HostConfig.OomKillDisable == false or $c.HostConfig.OomKillDisable == null) |
# AIDEV-NOTE: Shared-network tools inherit the donor hostname at start; allow only both immutable ID defaults.
(if $s.service == null and ($s.network | startswith("container:")) then
   require($s.network | test("^container:[0-9a-f]{64}$")) |
   require($c.Config.Hostname == $c.Id[0:12] or $c.Config.Hostname == $s.network[10:22]) |
   $c.Config | .Hostname = $c.Id[0:12]
 else $c.Config end) as $config |
$c | {Id, Name, Image, Config: $config, HostConfig: (.HostConfig | .OomKillDisable = false),
      Mounts: (mounts), Networks: (.NetworkSettings.Networks | keys)}
