import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiUrl, getToken, logoutRedirect } from "@/lib/auth";
import { Loader2, User, Lock, Eye, EyeOff, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";

interface UserProfile {
  id: string;
  username: string;
  email: string | null;
}

export default function Profile() {
  const queryClient = useQueryClient();
  const { language } = useTranslation() as { language: "pt" | "en" };
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(tr("Falha ao carregar perfil", "Failed to load profile"));
      const data = await res.json();
      setUser(data.user);
      setUsername(data.user.username);
      setEmail(data.user.email ?? "");
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateProfile(e: any) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const token = getToken();
      const res = await fetch(apiUrl("/api/auth/profile"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username,
          email: email.trim() === "" ? null : email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tr("Falha ao atualizar perfil", "Failed to update profile"));
      setSuccess(tr("Perfil atualizado com sucesso!", "Profile updated successfully!"));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (err: any) {
      setError(err?.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: any) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError(tr("As palavras-passe não coincidem", "Passwords do not match"));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(tr("A palavra-passe deve ter pelo menos 6 caracteres", "Password must be at least 6 characters"));
      return;
    }

    setChangingPassword(true);

    try {
      const token = getToken();
      const res = await fetch(apiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tr("Falha ao alterar palavra-passe", "Failed to change password"));
      setPasswordSuccess(tr("Palavra-passe alterada com sucesso!", "Password changed successfully!"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err?.message);
    } finally {
      setChangingPassword(false);
    }
  }

  function handleLogout() {
    queryClient.clear();
    logoutRedirect();
  }

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{tr("Perfil", "Profile")}</h1>
        <p className="text-sm text-muted-foreground">
          {tr("Gerir as suas informações pessoais e segurança.", "Manage your personal information and security.")}
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {user ? getInitials(user.username) : "??"}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle>{user?.username}</CardTitle>
              <CardDescription>{user?.email || tr("Sem email", "No email")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                {tr("Nome de utilizador", "Username")}
              </label>
              <Input
                value={username}
                onChange={(e: any) => setUsername(e.target.value)}
                placeholder={tr("utilizador", "username")}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("Email (opcional)", "Email (optional)")}</label>
              <Input
                type="email"
                value={email}
                onChange={(e: any) => setEmail(e.target.value)}
                placeholder={tr("email@exemplo.com", "email@example.com")}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tr("A guardar...", "Saving...")}
                </>
              ) : (
                tr("Guardar Alterações", "Save Changes")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            {tr("Alterar Palavra-passe", "Change Password")}
          </CardTitle>
          <CardDescription>
            {tr("Atualize a sua palavra-passe para manter a conta segura.", "Update your password to keep your account secure.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("Palavra-passe atual", "Current password")}</label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e: any) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("Nova palavra-passe", "New password")}</label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e: any) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("Confirmar nova palavra-passe", "Confirm new password")}</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e: any) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-green-600">{passwordSuccess}</p>}

            <Button type="submit" variant="secondary" disabled={changingPassword}>
              {changingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tr("A alterar...", "Updating...")}
                </>
              ) : (
                tr("Alterar Palavra-passe", "Change Password")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Logout Card */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-600">{tr("Terminar Sessão", "Log Out")}</CardTitle>
          <CardDescription>
            {tr("Sair da sua conta em todos os dispositivos.", "Sign out of your account on all devices.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            {tr("Terminar Sessão", "Log Out")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

