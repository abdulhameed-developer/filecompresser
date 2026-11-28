#!/usr/bin/env python3
"""Prepare the reviewed Firefox QA copy; never edit the canonical audit or launch a browser."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

SOURCE_SHA256 = '6b24b2133fa384ccca9e2a5a56be0b392ea3645fcf42d5d3d3eeb590c3d43268'
PATCH_SHA256 = '8fbdaa57c67a49a590640bdc09baec973d87474bc8930d727c839c3907866913'
OUTPUT_SHA256 = '534e0bf822ac9eb1825b8ef7ab5c6da04d589fb9edae9d60849951d52d201b7a'


def sha256(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    here = Path(__file__).resolve().parent
    repo = here.parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=repo / 'scripts/functionality-audit.mjs')
    parser.add_argument('--output-parent', type=Path, default=repo / '.qa-results/phase3/qa-recipes')
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    patch = here / 'firefox-nightly-native-input.patch'
    if sha256(source) != SOURCE_SHA256:
        raise SystemExit('Refusing unknown canonical source. Review a fresh diff rather than adapting this recipe silently.')
    if sha256(patch) != PATCH_SHA256:
        raise SystemExit('Refusing patch: its hash differs from the reviewed patch.')
    headers = [line for line in patch.read_text().splitlines() if line.startswith(('--- ', '+++ '))]
    if headers != ['--- a/scripts/functionality-audit.mjs', '+++ b/scripts/functionality-audit.mjs']:
        raise SystemExit('Refusing patch: unexpected target paths.')
    output_parent = args.output_parent.resolve()
    qa_root = (repo / '.qa-results').resolve()
    if output_parent != qa_root and qa_root not in output_parent.parents:
        raise SystemExit('The output parent must be inside this repository\'s ignored .qa-results directory.')
    patch_program = shutil.which('patch')
    if not patch_program:
        raise SystemExit('GNU patch is required; nothing has been changed.')
    output_parent.mkdir(parents=True, exist_ok=True)
    private_root = Path(tempfile.mkdtemp(prefix='firefox-nightly-native-input-', dir=output_parent))
    private_source = private_root / 'scripts/functionality-audit.mjs'
    private_source.parent.mkdir()
    shutil.copyfile(source, private_source)
    result = subprocess.run(
        [patch_program, '--batch', '--forward', '--fuzz=0', '-p1', '--directory', str(private_root), '--input', str(patch)],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30,
    )
    (private_root / 'patch.log').write_text(result.stdout)
    manifest = {
        'preparedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'canonicalSource': str(source),
        'canonicalBeforeSha256': SOURCE_SHA256,
        'canonicalAfterSha256': sha256(source),
        'patchSha256': sha256(patch),
        'patchExitCode': result.returncode,
        'privateHarness': str(private_source),
        'privateHarnessSha256': sha256(private_source),
        'expectedPrivateHarnessSha256': OUTPUT_SHA256,
        'prepared': False,
        'browserExecuted': False,
        'applicationChanged': False,
    }
    manifest['prepared'] = (
        result.returncode == 0
        and manifest['canonicalAfterSha256'] == SOURCE_SHA256
        and manifest['privateHarnessSha256'] == OUTPUT_SHA256
    )
    (private_root / 'preparation.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))
    if not manifest['prepared']:
        raise SystemExit('Private preparation failed; its original logs are preserved. No browser was launched.')


if __name__ == '__main__':
    main()
