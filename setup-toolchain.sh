#!/bin/bash
# Reinstall GBA toolchain (sandbox /opt may not persist). devkitPro apt/pacman is Cloudflare-blocked here; use Wonderful Toolchain (aarch64).
set -e
sudo apt-get install -y -qq make >/dev/null 2>&1 || true
if [ ! -x /opt/wonderful/bin/wf-pacman ]; then
  sudo mkdir -p /opt/wonderful && sudo chown -R "$(id -u)" /opt/wonderful
  curl -sL https://wonderful.asie.pl/bootstrap/wf-bootstrap-aarch64.tar.gz | tar xz -C /opt/wonderful
fi
export PATH=/opt/wonderful/bin:$PATH
wf-pacman -Syu --noconfirm
wf-pacman -S --noconfirm --needed wf-tools target-gba target-gba-libtonc
echo "OK: export PATH=/opt/wonderful/bin:\$PATH; templates in /opt/wonderful/templates/gba-tonc"
