import { USERNAME_MAX, usernameProblem } from "../../shared/username";

/** Optional public username at sign-up. Blank means "pick one for me". */
export function UsernameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const problem = value.trim() ? usernameProblem(value.trim().replace(/^@/, "")) : null;
  return (
    <label className="field">
      <span>
        Username <span className="optional">(optional, public)</span>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={USERNAME_MAX + 1}
        placeholder="e.g. HoppyBadger42"
      />
      {problem ? (
        <span className="hint error-hint">{problem}</span>
      ) : (
        <span className="hint">
          Shown on crawls you make public, instead of your name. Leave it blank and we'll pick one for you. You can
          change it later.
        </span>
      )}
    </label>
  );
}

/** True when the optional username is blank or valid. */
export const usernameOk = (v: string) => !v.trim() || !usernameProblem(v.trim().replace(/^@/, ""));
