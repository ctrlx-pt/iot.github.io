import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { setToken, clearToken, apiUrl } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function Login() {
  const [, navigate] = useLocation();
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [resending, setResending] = useState(false);

  async function onSubmitCredentials(e: any) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      const payload = data?.success === false ? data : data?.data ?? data;
      const errMsg =
        data?.errors?.[0]?.message ||
        data?.error ||
        (typeof data?.errors?.[0] === "string" ? data.errors[0] : null);

      if (!res.ok) {
        if (data.requiresEmailVerification || payload?.requiresEmailVerification) {
          navigate(`/verify-email?userId=${data.userId || payload?.userId}`);
          return;
        }
        throw new Error(errMsg || tr("Login falhou", "Login failed"));
      }

      if (payload?.requires2FA || data.requires2FA) {
        setRequires2FA(true);
        setUserId(payload?.userId || data.userId);
        setMaskedEmail(payload?.email || data.email);
      } else if (payload?.token || payload?.accessToken || data.token) {
        setToken(payload?.token || payload?.accessToken || data.token);
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      clearToken();
      setError(err?.message || tr("Login falhou", "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit2FA(e: any) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/verify-2fa"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: verificationCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || tr("Código inválido", "Invalid code"));
      }

      if (data.token) {
        setToken(data.token);
        // Force page reload to re-initialize auth state
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setError(err?.message || tr("Verificação falhou", "Verification failed"));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setResending(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/auth/resend-code"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, type: "login" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || tr("Falha ao reenviar", "Failed to resend"));
      }
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setResending(false);
    }
  }

  if (requires2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{tr("Verificação de Segurança", "Security Verification")}</CardTitle>
            <CardDescription>
              {tr("Enviámos um código de 6 dígitos para", "We sent a 6-digit code to")} {maskedEmail}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit2FA}>
              <div className="space-y-2">
                <label className="text-sm font-medium">{tr("Código de Verificação", "Verification Code")}</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e: any) =>
                    setVerificationCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest font-mono"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || verificationCode.length !== 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {tr("A verificar...", "Verifying...")}
                  </>
                ) : (
                  tr("Verificar", "Verify")
                )}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-primary"
                  onClick={resendCode}
                  disabled={resending}
                >
                  {resending ? tr("A enviar...", "Sending...") : tr("Reenviar código", "Resend code")}
                </button>
              </div>
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setRequires2FA(false);
                    setVerificationCode("");
                    setError(null);
                  }}
                >
                  {tr("← Voltar ao login", "← Back to login")}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{tr("Entrar", "Login")}</CardTitle>
          <CardDescription>
            {tr("Introduza as suas credenciais para continuar.", "Enter your credentials to continue.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmitCredentials}>
            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("Nome de utilizador", "Username")}</label>
              <Input
                value={username}
                onChange={(e: any) => setUsername(e.target.value)}
                placeholder={tr("utilizador", "username")}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("Palavra-passe", "Password")}</label>
              <Input
                type="password"
                value={password}
                onChange={(e: any) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tr("A entrar...", "Logging in...")}
                </>
              ) : (
                tr("Entrar", "Login")
              )}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-primary"
                onClick={() => navigate("/forgot-password")}
              >
                {tr("Esqueceu a palavra-passe?", "Forgot your password?")}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
