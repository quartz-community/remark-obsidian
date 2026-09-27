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
            ++ displayTools;

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
            echo "Recording needs a display. Headless:"
            echo "  xvfb-run -a --server-args=\"-screen 0 1280x1024x24\" npm run parity:record"
          '';
        };
      }
    );
}
