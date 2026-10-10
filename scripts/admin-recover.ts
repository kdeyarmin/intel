// Break-glass: make an account an active admin and give it a new password,
// for when nobody can sign in as an admin. Ends the account's other sessions.
//
//   RECOVER_EMAIL=you@example.com npx tsx scripts/admin-recover.ts
//
// Set RECOVER_PASSWORD to choose the password; otherwise a random one is
// printed once. Creates the account if it doesn't exist.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../server/db";
import { normalizeEmail, passwordProblem } from "../server/lib/accounts";
import { BCRYPT_COST } from "../server/lib/accountDeps";
import { pgUserRepo } from "../server/lib/userRepo";

async function main() {
  const email = normalizeEmail(process.env.RECOVER_EMAIL);
  if (!email) throw new Error("Set RECOVER_EMAIL to the account to recover.");
  const generated = !process.env.RECOVER_PASSWORD;
  const password = process.env.RECOVER_PASSWORD || crypto.randomBytes(12).toString("base64url");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);

  const repo = pgUserRepo(pool);
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const now = new Date();
  const [existing] = await repo.findByEmail(email);
  if (existing) {
    await repo.update(
      existing.id,
      { role: "admin", status: "active", password_hash: hash, password_changed_at: now, approved_at: existing.approved_at ?? now, approved_by: existing.approved_by ?? "admin-recover", disabled_at: null, disabled_reason: null },
      { endSessions: true },
    );
    await repo.revokeTokens(existing.id);
    console.log(`[admin-recover] ${existing.email} is now an active admin.`);
  } else {
    await repo.create({ email, password_hash: hash, full_name: null, role: "admin", status: "active", approved_at: now, approved_by: "admin-recover" });
    console.log(`[admin-recover] Created admin ${email}.`);
  }
  await pool.query(
    `INSERT INTO audit_events (event_type, user_email, action, entity_type, details) VALUES ('account', 'admin-recover', 'recover_admin', 'User', $1)`,
    [JSON.stringify({ target_email: email, created: !existing })],
  );
  if (generated) console.log(`[admin-recover] Temporary password: ${password}\nSign in and change it right away.`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("[admin-recover] Failed:", e?.message || e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
