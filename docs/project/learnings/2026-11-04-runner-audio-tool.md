# Prefer the main Ubuntu mirror for the audio validator

The stable draft-playtest CI run `41906059110` passed its complete WebKit job,
but Linux verification exhausted 15 minutes downloading FFmpeg dependencies from
`azure.archive.ubuntu.com`. Removing recommended packages had not solved the
slow binary downloads; package metadata itself arrived quickly.

Reuse FFmpeg when it is already on PATH. Otherwise point the hosted runner's
existing `/etc/apt/apt-mirrors.txt` list at the main HTTPS Ubuntu archive before
installing the same signed package without recommendations. The runner's
[APT source configuration](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh)
documents that mirror list; the runner maintainers also track
[slow Azure mirror downloads](https://github.com/actions/runner-images/issues/12949).
Keep the job deadline, audio validation, repository checks and engine targets.
Actual hosted completion must still qualify the mirror change.
