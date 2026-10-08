# Welcome to Kovan

A local AI research workbench for your **M5 Mac with 16 GB unified memory**.
The package includes source, a live observatory, tests, research, and retained failures.
It is still experimental; no laptop speedup has been established.

## Open the GUI

Install **Node.js 24 or newer** from [nodejs.org](https://nodejs.org/).
Open Terminal in this folder and run:

```sh
npm ci
npm start
```

Or double-click **Launch Kovan.command** after installing Node. If macOS declines to open a downloaded command file, use the Terminal command above; no security setting changes are needed.

Your browser opens **http://127.0.0.1:8123**. Keep the Terminal window open.
The selector contains actual recorded experiments, including failed runs. New reports in `artifacts/` appear live. The GUI is a read-only observatory; commands start experiments.

## Continue on your Mac

Read [the Mac guide](docs/MAC-HANDOFF.md) for Metal inference, model downloads and isolated coding tests.
Read [the handoff state](HANDOFF.md) before continuing development.
Run `npm run mac:doctor` to record your hardware and installed tools.

GGUF weights, Node, llama.cpp and Docker are installed separately. The code and evidence are included; there are no API keys or hosted AI dependencies.

For ongoing development, a Git checkout is preferable to an extracted archive:

```sh
git clone https://github.com/virideanil/ailab.git
cd ailab
npm ci
npm start
```

Sign in to GitHub normally for this private repository. Keep your changes in commits and use `git pull --ff-only` to receive later work when your checkout is clean.
