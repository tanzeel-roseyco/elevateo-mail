# Coordinator backup verification — 2026-10-23

The existing operator backup is accepted as evidence of recovery of the stack's actual empty state, not populated mailbox recovery or permission to apply production schema changes.

At 12:07 UTC the coordinator independently read the protected operator capture script, final `restore.sh`, source-derived ACL supplement/query, isolation receipt and SHA-256 manifest on fleet-02. `sha256sum -c evidence.sha256` passed every entry. The final restore script uses the pinned production image, the shared Docker lock, an internal task network, no published ports, tmpfs restore storage and exact task cleanup. It restores into `restore_acceptance`; earlier failed baseline-reset attempts in `operator.sh` are historical and must not be rerun as the final recovery procedure. Normalization sorts ACL entries rather than removing permission differences.

At 12:08:11 UTC the coordinator streamed the retained operator directory over authenticated SSH into memory on the laptop and encrypted it using Windows DPAPI `CurrentUser`. No plaintext archive was written to the laptop. The destination directory disables inherited permissions and grants only the current Windows account and SYSTEM full control. The original fleet backup remains intact. A subsequent decryption in memory reproduced the archive SHA-256 exactly; plaintext buffers were cleared after comparison.

Private destination, outside Git:

`C:\Users\Tanzeel\AppData\Local\Elevateo Mail\protected-backups\20261023-operator\operator-backup.tar.gz.dpapi`

The adjacent `receipt.json` records:

- Plain archive: 77,584 bytes; SHA-256 `33f94e2195c8867487ca9c4c7ea86f985b27a60765b38b5c713f0b09a711fe12`.
- Encrypted archive SHA-256: `3c652405d6bee0ad89bdb613e9c137ee8d9f9050903b45c59762dc34c6a749a0`.
- Encryption/decryption round trip: PASS.

This provides an encrypted off-host copy of the recorded operator snapshot. Recovery depends on this Windows user's DPAPI master keys/profile; independently escrowed recovery-key custody is still absent. No scheduled backup or populated-data recovery guarantee is established. The source snapshot contained zero Auth users/identities and zero Storage objects/buckets. No live database mutation, application test on the laptop, Docker build, DNS change, email send, purchase or shared-workload cleanup occurred in this verification.
