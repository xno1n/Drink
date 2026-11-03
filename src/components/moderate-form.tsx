"use client";
import { moderateReport } from "@/app/actions/moderation";

export function ModerateForm({ reportId, hasPost }: { reportId: string; hasPost: boolean }) {
  return (
    <form action={moderateReport} className="mt-3 flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(e) => { const f = new FormData(e.currentTarget); const a = f.get("action");
        if ((a === "remove_post" || a === "suspend") && !confirm(`Confirm: ${a}?`)) e.preventDefault(); }}>
      <input type="hidden" name="report" value={reportId} />
      <select name="action" className="glass rounded-lg bg-transparent p-2" aria-label="action">
        {hasPost && <option value="remove_post">Remove post</option>}
        <option value="suspend">Suspend author/user</option>
        <option value="warn">Warn</option>
        <option value="dismiss">Dismiss</option>
      </select>
      <input name="days" type="number" min={1} max={365} defaultValue={7} className="glass w-16 rounded-lg bg-transparent p-2" aria-label="days" />
      <input name="reason" required minLength={3} maxLength={500} placeholder="Reason (required)" className="glass min-w-40 flex-1 rounded-lg bg-transparent p-2" />
      <button className="rounded-lg bg-black px-3 py-2 font-semibold text-white dark:bg-white dark:text-black">Apply</button>
    </form>
  );
}
