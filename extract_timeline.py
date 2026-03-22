#!/usr/bin/env python3
"""Extract publisher data at each point in git history to build timeline.json."""
import subprocess
import json
import re
from collections import OrderedDict
from difflib import SequenceMatcher

PUBLISHERS = ['PRH', 'HarperCollins', 'Macmillan', 'SS', 'Hachette']


def git(*args):
    r = subprocess.run(['git'] + list(args), capture_output=True, text=True)
    return r.stdout.strip()


def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def get_parents(data):
    """Map each leaf imprint name to its parent division via the imprint field."""
    parents = {}
    for node in data['nodes']:
        name = node.get('name', '')
        imprint = node.get('imprint', '')
        if name and imprint and name != imprint:
            parents[name] = imprint
    return parents


def detect_renames(added, removed, threshold=0.72):
    """Match removed names to added names by string similarity, return dict old->new."""
    renames = {}
    remaining_added = set(added)

    for r in sorted(removed):
        best_score = 0
        best_match = None
        r_norm = normalize(r)

        for a in remaining_added:
            a_norm = normalize(a)
            if r_norm in a_norm or a_norm in r_norm:
                score = max(0.8, SequenceMatcher(None, r_norm, a_norm).ratio())
            else:
                score = SequenceMatcher(None, r_norm, a_norm).ratio()
            if score > best_score:
                best_score = score
                best_match = a

        if best_score >= threshold and best_match:
            renames[r] = best_match
            remaining_added.discard(best_match)

    return renames


def main():
    raw = git('log', '--reverse', '--format=%H %ad %s', '--date=short', '--', 'data/')

    dates = OrderedDict()
    for line in raw.split('\n'):
        if not line.strip():
            continue
        parts = line.split(' ', 2)
        sha, date = parts[0], parts[1]
        msg = parts[2] if len(parts) > 2 else ''
        if date not in dates:
            dates[date] = {'sha': sha, 'messages': []}
        dates[date]['sha'] = sha
        if msg and msg not in dates[date]['messages']:
            dates[date]['messages'].append(msg)

    snapshots = []
    prev_names = {p: set() for p in PUBLISHERS}
    prev_parents = {p: {} for p in PUBLISHERS}

    for date, info in dates.items():
        sha = info['sha']
        publishers = {}
        changes = []

        for pub in PUBLISHERS:
            try:
                raw_json = git('show', f'{sha}:data/{pub}.json')
                data = json.loads(raw_json)
                publishers[pub] = data

                names = {n['name'] for n in data['nodes'] if n.get('name', '')}
                parents = get_parents(data)

                raw_added = sorted(names - prev_names[pub])
                raw_removed = sorted(prev_names[pub] - names)

                renames = detect_renames(raw_added, raw_removed)
                renamed_old = set(renames.keys())
                renamed_new = set(renames.values())

                added = [n for n in raw_added if n not in renamed_new]
                removed = [n for n in raw_removed if n not in renamed_old]

                common = names & prev_names[pub]
                for name in sorted(common):
                    old_parent = prev_parents[pub].get(name)
                    new_parent = parents.get(name)
                    if old_parent and new_parent and old_parent != new_parent:
                        changes.append({
                            'type': 'moved',
                            'publisher': pub,
                            'name': name,
                            'from': old_parent,
                            'to': new_parent
                        })

                for name in added:
                    changes.append({'type': 'added', 'publisher': pub, 'name': name})
                for name in removed:
                    changes.append({'type': 'removed', 'publisher': pub, 'name': name})

                prev_names[pub] = names
                prev_parents[pub] = parents
            except Exception:
                pass

        snapshots.append({
            'date': date,
            'message': '; '.join(info['messages']),
            'publishers': publishers,
            'changes': changes
        })

    with open('data/timeline.json', 'w') as f:
        json.dump({'snapshots': snapshots}, f, separators=(',', ':'))

    size = len(json.dumps({'snapshots': snapshots}, separators=(',', ':')))
    print(f'Generated {len(snapshots)} snapshots ({size / 1024:.0f} KB)')
    for s in snapshots:
        by_type = {}
        for c in s['changes']:
            by_type[c['type']] = by_type.get(c['type'], 0) + 1
        parts = []
        for t in ['added', 'removed', 'moved']:
            if t in by_type:
                sym = {
                    'added': f"+{by_type[t]}",
                    'removed': f"-{by_type[t]}",
                    'moved': f"~{by_type[t]}"
                }[t]
                parts.append(sym)
        summary = ' '.join(parts) if parts else 'no changes'
        print(f"  {s['date']}: {summary}")


if __name__ == '__main__':
    main()
