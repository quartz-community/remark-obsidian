{
  description = "Development environment for remark-obsidian with Obsidian parity testing";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
          };
        };

        linuxLibraries = (
          if pkgs.stdenv.isLinux then
            with pkgs;
            [
              libdrm
              alsa-lib
              udev
              libx11
              libxcomposite
              libxdamage
              libxext
              libxfixes
              libxrandr
              libxcb
              libxcursor
              libxi
              libxrender
              libxtst
              libxscrnsaver
              gtk3
              gtk4
              libGL
              libgbm
              fontconfig
              freetype
              libuuid
              systemd
              wayland
              libnotify
              libappindicator-gtk3
              libdbusmenu
            ]
          else
            [ ]
        );

        libraries =
          with pkgs;
          [
            stdenv.cc.cc.lib
            zlib
            glib
            nss
            nspr
            atk
            cups
            dbus
            dbus.lib
            expat
            libxkbcommon
            pango
            cairo
            mesa
            at-spi2-atk
            at-spi2-core
            curl
            wget
          ]
          ++ linuxLibraries;

        # The parity oracle drives a real Obsidian window. Reading mode renders off
        # requestAnimationFrame, which Chromium starves for unmapped windows, so a
        # virtual display needs a window manager to map and focus the window.
        displayTools =
          if pkgs.stdenv.isLinux then
            with pkgs;
            [
              xvfb-run
              xorg.xvfb
              xorg.xdpyinfo
              herbstluftwm
            ]
          else
            [ ];

        # `npm run parity:record` needs a mapped, focused window, and the two
        # ways it fails are both environmental rather than obvious:
        #
        #   * Obsidian's launcher leaves a `/tmp/obsidian-launcher-config-*`
        #     directory holding a cached asar behind on every run. They
        #     accumulate, and a few hundred are enough to make the next launch
        #     hang before it prints anything.
        #   * A server killed without cleanup leaves `/tmp/.X<n>-lock` with no
        #     process behind it. The next Xvfb refuses that display and the run
        #     hangs waiting for one that never arrives.
        #
        # Both cost an afternoon to find once. The wrapper clears the scratch,
        # picks a display whose lock is genuinely free, and tears down through a
        # trap so the lock goes even when the recorder crashes or is interrupted.
        parityRecord =
          if pkgs.stdenv.isLinux then
            [
              (pkgs.writeShellScriptBin "parity-record" ''
                set -euo pipefail

                rm -rf /tmp/obsidian-launcher-config-* 2>/dev/null || true

                DISPLAY_NUM=""
                for n in $(${pkgs.coreutils}/bin/seq 90 99); do
                  if [ -e "/tmp/.X''${n}-lock" ] &&
                     ! ${pkgs.procps}/bin/pgrep -f "Xvfb :''${n}( |$)" >/dev/null 2>&1; then
                    rm -f "/tmp/.X''${n}-lock" "/tmp/.X11-unix/X''${n}" 2>/dev/null || true
                  fi
                  if [ ! -e "/tmp/.X''${n}-lock" ]; then DISPLAY_NUM="''${n}"; break; fi
                done
                if [ -z "''${DISPLAY_NUM}" ]; then
                  echo "parity-record: displays :90-:99 are all taken" >&2
                  exit 1
                fi

                XVFB_PID=""
                WM_PID=""
                cleanup() {
                  [ -n "''${WM_PID}" ] && kill -9 "''${WM_PID}" 2>/dev/null || true
                  [ -n "''${XVFB_PID}" ] && kill -9 "''${XVFB_PID}" 2>/dev/null || true
                  rm -f "/tmp/.X''${DISPLAY_NUM}-lock" \
                        "/tmp/.X11-unix/X''${DISPLAY_NUM}" 2>/dev/null || true
                }
                trap cleanup EXIT INT TERM

                export DISPLAY=":''${DISPLAY_NUM}"
                echo "parity-record: using ''${DISPLAY}"
                ${pkgs.xorg.xvfb}/bin/Xvfb "''${DISPLAY}" \
                  -screen 0 1280x1024x24 +extension GLX -noreset >/dev/null 2>&1 &
                XVFB_PID=$!
                for _ in $(${pkgs.coreutils}/bin/seq 1 80); do
                  ${pkgs.xorg.xdpyinfo}/bin/xdpyinfo -display "''${DISPLAY}" \
                    >/dev/null 2>&1 && break
                  sleep 0.25
                done

                # Chromium starves requestAnimationFrame for unmapped windows,
                # so reading mode never renders without a window manager.
                ${pkgs.herbstluftwm}/bin/herbstluftwm >/dev/null 2>&1 &
                WM_PID=$!
                sleep 2

                npm run parity:record "$@"
              '')
            ]
          else
            [ ];

        nix-ld-libraries = pkgs.lib.makeLibraryPath libraries;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs =
            with pkgs;
            [
              nodejs_24
              git
              python3
            ]
            ++ libraries
            ++ displayTools
            ++ parityRecord;

          NIX_LD_LIBRARY_PATH = nix-ld-libraries;
          NIX_LD = pkgs.lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker";

          shellHook = ''
            echo "remark-obsidian development environment loaded"
            echo "Node.js version: $(node --version)"
            echo ""
            echo "  npm test            unit tests"
            echo "  npm run test:parity parity gate against committed goldens"
            echo "  npm run parity:record  re-record goldens from real Obsidian"
            echo ""
            echo "Recording needs a mapped, focused window. Use:"
            echo "  parity-record        clears stale launcher and X state, then records"
            echo ""
            echo "Call it rather than npm run parity:record directly: it clears the"
            echo "/tmp/obsidian-launcher-config-* scratch Obsidian leaves behind, which"
            echo "hangs the next launch once a few hundred accumulate, and removes the"
            echo "/tmp/.X<n>-lock a killed server leaves with no process behind it."
          '';
        };
      }
    );
}
