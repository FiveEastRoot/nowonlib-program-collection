import { KeyRound, LibraryBig, LogIn } from "lucide-react";
import { type FormEvent, useState } from "react";

interface LoginScreenProps {
  error: string;
  busy: boolean;
  onLogin: (id: string, pin: string) => Promise<void>;
}

export function LoginScreen({ error, busy, onLogin }: LoginScreenProps) {
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(id, pin);
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand__mark" aria-hidden="true">
            <LibraryBig size={30} />
          </span>
          <div>
            <span>노원구립도서관</span>
            <strong>문화프로그램 통합 수합</strong>
          </div>
        </div>

        <div className="login-heading">
          <h1 id="login-title">로그인</h1>
          <p>도서관 영문 아이디와 4자리 비밀번호를 입력해주세요.</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>아이디</span>
            <div className="login-input">
              <LibraryBig size={18} aria-hidden="true" />
              <input
                autoCapitalize="none"
                autoComplete="username"
                disabled={busy}
                maxLength={40}
                onChange={(event) => setId(event.target.value)}
                placeholder="예: nowon-central"
                required
                spellCheck={false}
                value={id}
              />
            </div>
          </label>
          <label>
            <span>비밀번호</span>
            <div className="login-input">
              <KeyRound size={18} aria-hidden="true" />
              <input
                autoComplete="current-password"
                disabled={busy}
                inputMode="numeric"
                maxLength={4}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                pattern="\d{4}"
                placeholder="숫자 4자리"
                required
                type="password"
                value={pin}
              />
            </div>
          </label>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="button button--primary login-button"
            disabled={busy || !id.trim() || pin.length !== 4}
            type="submit"
          >
            <LogIn size={18} />
            {busy ? "로그인 중…" : "로그인"}
          </button>
        </form>

        <p className="login-help">
          아이디와 비밀번호 변경은 수합 관리자에게 문의해주세요.
        </p>
      </section>
    </main>
  );
}
