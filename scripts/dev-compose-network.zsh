is_usable_lan_ipv4() {
  local address="$1"
  local -a octets
  local octet

  if [[ "${address}" != <->.<->.<->.<-> ]]; then
    return 1
  fi

  octets=("${(@s:.:)address}")

  for octet in "${octets[@]}"; do
    if (( octet < 0 || octet > 255 )); then
      return 1
    fi
  done

  if ((
    octets[1] == 0 ||
    octets[1] == 127 ||
    (octets[1] == 169 && octets[2] == 254) ||
    octets[1] >= 224
  )); then
    return 1
  fi

  return 0
}

is_physical_lan_interface() {
  [[ "$1" == en<-> ]]
}

detect_lan_ipv4() {
  local route_output
  local interface_output
  local interface
  local address
  local -a candidates
  local -A seen

  if ! command -v ipconfig >/dev/null 2>&1; then
    return 1
  fi

  candidates=()

  if command -v route >/dev/null 2>&1 && route_output="$(route -n get default 2>/dev/null)"; then
    interface="$(print -r -- "${route_output}" | awk '$1 == "interface:" { print $2; exit }')"
    if [[ -n "${interface}" ]]; then
      candidates+=("${interface}")
    fi
  fi

  if command -v netstat >/dev/null 2>&1 && route_output="$(netstat -rn -f inet 2>/dev/null)"; then
    interface_output="$(print -r -- "${route_output}" | awk '$1 == "default" { print $4 }')"
    if [[ -n "${interface_output}" ]]; then
      candidates+=("${(@f)interface_output}")
    fi
  fi

  if command -v ifconfig >/dev/null 2>&1 && interface_output="$(ifconfig -l 2>/dev/null)"; then
    if [[ -n "${interface_output}" ]]; then
      candidates+=("${(@s: :)interface_output}")
    fi
  fi

  for interface in "${candidates[@]}"; do
    if ! is_physical_lan_interface "${interface}" || [[ -n "${seen[${interface}]-}" ]]; then
      continue
    fi
    seen[${interface}]=1

    if ! address="$(ipconfig getifaddr "${interface}" 2>/dev/null)"; then
      continue
    fi

    if is_usable_lan_ipv4 "${address}"; then
      print -r -- "${address}"
      return 0
    fi
  done

  return 1
}
