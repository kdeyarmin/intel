# Customer support identity proof

The hosted `centralAdminRead` bridge adds `support.identity.resolve` under its existing one-use, operation-bound Hub SMS authority. It rechecks the mapped native protected administrator and then reads only the exact requested User's `id`, `role` and `updated_date`.

Intel has individual accounts in this runtime. The source account ID must equal the native user ID. The response reports `individual_owner`; it does not invent an organization or claim verified account activity. Missing, duplicated or unsupported protected User records fail closed. Only IDs, relationship and an opaque revision are returned.

The Hub resolves this evidence again before the operator-reviewed pairing to an existing verified Hub SMS user. This function creates no account, role or membership. Existing bridge rollout flags and native identity mapping remain required. Hosted bootstrap recovery is a separate prerequisite; do not publish the stored Express frontend to deploy this function.
