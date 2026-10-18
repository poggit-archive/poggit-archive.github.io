"""Read inert image entries from the existing verified PHAR cache (PHP >= 8)."""
import argparse
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--php', required=True)
args = parser.parse_args()
pointer = json.loads((root / 'data/api/v1/current.json').read_text(encoding='utf-8'))
downloads = json.loads((root / 'data/snapshots' / pointer['snapshot_id'] / 'downloads-plugins.json').read_text(encoding='utf-8'))
output = root / 'archive/media-phar'
request = {'output': str(output), 'files': {key: {'path': str(root / 'archive/virion-recovery/plugin-phars' / (key + '.phar')), 'sha256': row['sha256']} for key, row in downloads.items()}}
result = subprocess.run([args.php, '-d', 'phar.readonly=1', str(root / 'scripts/read_phar_media.php')], input=json.dumps(request), capture_output=True, text=True, encoding='utf-8', check=True)
(output / 'index.json').write_text(result.stdout, encoding='utf-8')
print('Indexed', sum(map(len, json.loads(result.stdout).values())), 'verified PHAR image entries')
