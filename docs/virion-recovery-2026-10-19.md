# Virion source preservation - 19 October 2026

This is the initial recovery batch. The [follow-up investigation](virion-recovery-followup-2026-10-19.md) recovers four of the ten entries below, bringing coverage to 259/265 source ZIPs and PHARs. The counts and unresolved table in this initial report describe the earlier batch.

The saved catalog contains 265 distinct entries from Poggit's ranked top-300 page. It does not represent every historical virion or version.

After this recovery, **255/265 entries have a separately archived source ZIP and a PHAR**. There are 213 original PHARs and 42 reconstructions, including eight new reconstructions in this batch. Ten entries remain without a matching source tree or PHAR.

The [source manifest](../data/snapshots/2026-10-14T20-07-25Z/virion-source-downloads.json), [reconstruction manifest](../data/snapshots/2026-10-14T20-07-25Z/rebuilt-virions.json), [research evidence](../data/snapshots/2026-10-14T20-07-25Z/virion-recovery-audit.json) and [remote verification](../data/snapshots/2026-10-14T20-07-25Z/virion-artifact-verification.json) record the exact identities, hashes and checks.

## New PHARs

| Catalog entry | Rebuilt version | Source | Original Poggit revision established? | License document |
| --- | --- | --- | --- | --- |
| inxomnyaa/libstructure | 0.4.0 | PM5 branch, `d925c10a5c1c13aedbcb77896a3d36516c8e6588` | No | No License |
| adeynes/parsecmd | 5.0.1, catalog version unspecified | `4f5649734a6a390743f870a0a7ccd47ad683c748` | No | No License |
| Cosmoverse/BlockData | 0.0.3, catalog version unspecified | `b8d8bb93bf23fd41a94b4bf2b110ff024bf365eb` | No | No License |
| mintodev/libMCUnicodeChars | 1.1.0 | Detached fork [NoobMCBG/libMCUnicodeChars](https://github.com/NoobMCBG/libMCUnicodeChars/tree/a9252870f2d6aad3151cd9a61679289f08fb1b22) | Yes | MIT |
| Cosmoverse/AntiVPN | 2.1.0 | [iZeaoGamer/AntiVPN](https://github.com/iZeaoGamer/AntiVPN/tree/ba7235ff264b08798e54d3d1d2a9de19c0d0e436) | Yes | No License |
| radondev/libInterpolation | 0.1.0 | [WolvesFortress/libInterpolation](https://github.com/WolvesFortress/libInterpolation/tree/e6bc4895c8f1507a06110213cb947157e00acad2) | No | No License |
| luca28pet/ConfigParser | 1.0.1 | [Software Heritage revision](https://archive.softwareheritage.org/browse/revision/0eb691fe89d2a82e1ffa25f863a53e24b7a287d9/) | No | GPL document preserved |
| vkamz597/ItemParser | 5.0.0 | [Software Heritage revision](https://archive.softwareheritage.org/browse/revision/dfae084f558804bb9e6752e4ca4782c07e89a57b/) | No | No License |

For libMCUnicodeChars and AntiVPN, a plugin dependency's decimal `build_id` equals the catalog's hexadecimal `last_build_short_id`. That same dependency records the full Git SHA. Both commits remain available in forks, even though the original repositories return 404. A shared version number alone was not used as proof of the original revision.

libstructure's default branch has an older `0.0.0` manifest and different namespace. The reconstruction uses the PM5 branch's matching `0.4.0` manifest. ConfigParser omits the compiler-required `api` field; only its staging manifest receives `api: []`. This adjustment is recorded, does not assert compatibility, and leaves the source ZIP unchanged.

All eight PHARs were compiled with unmodified VirionTools 4.0.1 at `d3bcaa5bbe5344996fb06b6192ca37be980dd7eb`. Their metadata, signatures and included source bytes were checked after reopening. Target PHP and PHAR stubs were never executed. This verifies reconstruction integrity; it does not establish runtime compatibility with a PocketMine server.

## Separate source ZIPs

The [source release](https://github.com/poggit-archive/artifacts/releases/tag/virion-sources-2026-10-14-0001) contains 255 ZIPs:

- **214 Archived source**: 212 source commits read from verified original PHAR manifests, plus the two exact dependency build matches above.
- **40 Rebuild source**: complete Git source trees pinned to the revision used for reconstruction. The original Poggit revision remains unconfirmed.
- **1 Source from PHAR**: `SOF3/pschemlib 0.0.0` has no recoverable full build SHA in its original PHAR manifest. Its ZIP preserves packaged files and includes `RECOVERY.json` with original and per-file hashes. It is not a complete Git snapshot.

For GitHub ZIPs, the downloader checks the full SHA directory, CRC, safe paths and size limits. For Software Heritage, it recomputes Git blob hashes and the full root tree hash against the archived revision before producing a ZIP. These ZIPs preserve source trees, not full Git history.

Five saved original PHARs have a build ID different from the catalog's last-build marker: CortexPE/Commando, inxomnyaa/apibossbar, NhanAZ-Libraries/BlockData, DaisukeDaisuke/AwaitFormOptions and XanderID/PocketForm. Their archived source follows the **preserved PHAR's recorded revision**. Every specified catalog version still matches its PHAR manifest. The evidence records these differences explicitly.

The [new PHAR release](https://github.com/poggit-archive/artifacts/releases/tag/rebuilt-virions-2026-10-14-0001) contains the eight reconstructions. Each of the 510 linked virion assets (255 ZIPs and 255 PHARs) was checked independently against GitHub release listings for asset ID, URL, uploaded state, size and SHA-256, with public, non-draft releases confirmed.

## The ten unresolved entries

| Entry | Remaining gap |
| --- | --- |
| Blugin/SingletonTrait 1.0.0 | Detached monorepo fork has `blugin\lib\traits\singleton`; catalog requires `blugin\traits\singleton`. |
| Blugin/stringutils 1.1.1 | Fork contains version 1.0.0 and a different namespace. |
| Blugin/arrayutils 2.0.0 | Project absent from the fork and its available Git history. |
| vosaka-php/vosaka 1.9.0 | pm-pl copy has an older 1.0.5 manifest; newer foroutines implementation does not supply this virion. |
| ZetNex/Map 1.0.1 | No matching repository, namespace or archive snapshot recovered. |
| Jasson44/TelegramBotAPI 1.0.0 | Name matches do not contain the target `xeonch\telegramapi` virion. |
| Tobias-2006/CommandArguments | No matching repository or namespace recovered; SmartCommand candidates differ. |
| kenzeve/ReplayLib 1.0.0 | References exist, but no matching source tree was recovered. |
| stephen-mc-pl/pmforms-pm4 1.0.1 | Other pmforms copies do not establish this repository's catalog build. |
| InkoHX/Krul 0.1.0 | No matching repository, namespace or archived origin recovered. |

Research covered repository-name searches including forks, namespace searches, candidate manifests and relevant full Git histories, Software Heritage origin visits, Wayback Availability for all 13 original repository URLs, and historical public ForkEvents. Software Heritage supplied complete trees for ConfigParser and ItemParser. Wayback returned no available capture for the checked repository URLs. This does not establish that every possible raw-file, branch or ZIP URL is absent from Wayback, or that the unresolved source has been lost everywhere.

The interface uses **No License** when the saved license field is empty or the recovered source has no nonempty license document. Existing license notices remain in ZIPs and PHARs; no replacement license file was added.
