#!/usr/bin/env bash
# AIDEV-NOTE: every inventory query must succeed before exact project absence is evidence.
ops820_compose_absent() {
  local project=${1:?project required} containers volumes networks
  containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project") || return 1
  volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$project") || return 1
  networks=$(docker network ls -q --filter "label=com.docker.compose.project=$project") || return 1
  [[ -z "$containers" && -z "$volumes" && -z "$networks" ]]
}
