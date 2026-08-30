import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "en" | "pt" | "es" | "fr";

type TranslationEntry = {
  en: string;
  pt?: string;
  es?: string;
  fr?: string;
};

type Translations = {
  [key: string]: TranslationEntry;
};

export const translations: Translations = {
  // Navigation
  "nav.dashboard": { pt: "Dashboard", en: "Dashboard" },
  "nav.controlPanel": { pt: "Painel de Controlo", en: "Control Panel" },
  "nav.search": { pt: "Pesquisar", en: "Search" },
  "nav.stores": { pt: "Lojas", en: "Stores" },
  "nav.allStores": { pt: "Todas as Lojas", en: "All Stores" },
  "nav.spaces": { pt: "Espaços", en: "Spaces" },
  "nav.lights": { pt: "Luzes", en: "Lights" },
  "nav.tvs": { pt: "TVs", en: "TVs" },
  "nav.videos": { pt: "Vídeos", en: "Videos" },
  "nav.media": { pt: "Média", en: "Media" },
  "nav.ecoManagement": { pt: "Gestão Eco", en: "Eco Management" },
  "nav.energyUsage": { pt: "Consumo Energético", en: "Energy Usage" },
  "nav.reports": { pt: "Relatórios", en: "Reports" },
  "nav.administration": { pt: "Administração", en: "Administration" },
  "nav.organizations": { pt: "Organizações", en: "Organizations" },
  "nav.members": { pt: "Membros", en: "Members" },
  "nav.activityLogs": { pt: "Logs de Atividade", en: "Activity Logs" },
  "nav.recentStores": { pt: "Lojas Recentes", en: "Recent Stores" },
  "nav.devices": { pt: "Dispositivos", en: "Devices" },
  "nav.lightControl": { pt: "Controlo de Luzes", en: "Light Control" },
  "nav.schedules": { pt: "Agendamentos", en: "Schedules" },

  // Common
  "common.loading": { pt: "A carregar...", en: "Loading..." },
  "common.save": { pt: "Guardar", en: "Save" },
  "common.cancel": { pt: "Cancelar", en: "Cancel" },
  "common.delete": { pt: "Eliminar", en: "Delete" },
  "common.edit": { pt: "Editar", en: "Edit" },
  "common.add": { pt: "Adicionar", en: "Add" },
  "common.create": { pt: "Criar", en: "Create" },
  "common.search": { pt: "Pesquisar", en: "Search" },
  "common.filter": { pt: "Filtrar", en: "Filter" },
  "common.actions": { pt: "Ações", en: "Actions" },
  "common.status": { pt: "Estado", en: "Status" },
  "common.name": { pt: "Nome", en: "Name" },
  "common.description": { pt: "Descrição", en: "Description" },
  "common.date": { pt: "Data", en: "Date" },
  "common.time": { pt: "Hora", en: "Time" },
  "common.yes": { pt: "Sim", en: "Yes" },
  "common.no": { pt: "Não", en: "No" },
  "common.all": { pt: "Todos", en: "All" },
  "common.none": { pt: "Nenhum", en: "None" },
  "common.online": { pt: "Online", en: "Online" },
  "common.offline": { pt: "Offline", en: "Offline" },
  "common.success": { pt: "Sucesso", en: "Success" },
  "common.error": { pt: "Erro", en: "Error" },
  "common.warning": { pt: "Aviso", en: "Warning" },
  "common.info": { pt: "Info", en: "Info" },
  "common.refresh": { pt: "Atualizar", en: "Refresh" },
  "common.view": { pt: "Ver", en: "View" },
  "common.close": { pt: "Fechar", en: "Close" },
  "common.back": { pt: "Voltar", en: "Back" },
  "common.next": { pt: "Seguinte", en: "Next" },
  "common.previous": { pt: "Anterior", en: "Previous" },
  "common.submit": { pt: "Submeter", en: "Submit" },
  "common.reset": { pt: "Repor", en: "Reset" },
  "common.copy": { pt: "Copiar", en: "Copy" },
  "common.copied": { pt: "Copiado!", en: "Copied!" },

  // Dashboard
  "dashboard.title": { pt: "Dashboard de Controlo", en: "Control Dashboard" },
  "dashboard.subtitle": { pt: "Monitorização e controlo em tempo real", en: "Real-time monitoring and control" },
  "dashboard.welcome": { pt: "Bem-vindo", en: "Welcome" },
  "dashboard.totalStores": { pt: "Total de Lojas", en: "Total Stores" },
  "dashboard.totalSpaces": { pt: "Total de Espaços", en: "Total Spaces" },
  "dashboard.totalLights": { pt: "Total de Luzes", en: "Total Lights" },
  "dashboard.totalTVs": { pt: "Total de TVs", en: "Total TVs" },
  "dashboard.activeLights": { pt: "Luzes Ativas", en: "Active Lights" },
  "dashboard.energyToday": { pt: "Energia Hoje", en: "Energy Today" },
  "dashboard.recentActivity": { pt: "Atividade Recente", en: "Recent Activity" },
  "dashboard.instantUsage": { pt: "Uso Instantâneo", en: "Instant Usage" },
  "dashboard.calendar": { pt: "Calendário", en: "Calendar" },
  "dashboard.addSchedule": { pt: "Adicionar", en: "Add" },

  // Energy
  "energy.title": { pt: "Consumo Energético", en: "Energy Usage" },
  "energy.subtitle": { pt: "Monitorização do consumo de energia", en: "Energy consumption monitoring" },
  "energy.today": { pt: "Hoje", en: "Today" },
  "energy.thisWeek": { pt: "Esta Semana", en: "This Week" },
  "energy.thisMonth": { pt: "Este Mês", en: "This Month" },
  "energy.thisYear": { pt: "Este Ano", en: "This Year" },
  "energy.kwh": { pt: "kWh", en: "kWh" },
  "energy.watts": { pt: "Watts", en: "Watts" },
  "energy.cost": { pt: "Custo", en: "Cost" },
  "energy.savings": { pt: "Poupança", en: "Savings" },
  "energy.comparison": { pt: "Comparação", en: "Comparison" },
  "energy.byStore": { pt: "Por Loja", en: "By Store" },
  "energy.bySpace": { pt: "Por Espaço", en: "By Space" },
  "energy.byLight": { pt: "Por Luz", en: "By Light" },
  "energy.hourlyUsage": { pt: "Uso por Hora", en: "Hourly Usage" },
  "energy.dailyUsage": { pt: "Uso Diário", en: "Daily Usage" },
  "energy.weeklyUsage": { pt: "Uso Semanal", en: "Weekly Usage" },
  "energy.monthlyUsage": { pt: "Uso Mensal", en: "Monthly Usage" },
  "energy.peakHours": { pt: "Horas de Pico", en: "Peak Hours" },
  "energy.offPeakHours": { pt: "Horas Vazio", en: "Off-Peak Hours" },

  // Lights
  "lights.title": { pt: "Luzes", en: "Lights" },
  "lights.addLight": { pt: "Adicionar Luz", en: "Add Light" },
  "lights.brightness": { pt: "Brilho", en: "Brightness" },
  "lights.color": { pt: "Cor", en: "Color" },
  "lights.turnOn": { pt: "Ligar", en: "Turn On" },
  "lights.turnOff": { pt: "Desligar", en: "Turn Off" },
  "lights.smartLights": { pt: "Luzes Inteligentes", en: "Smart Lights" },
  "lights.noLights": { pt: "Ainda sem luzes adicionadas", en: "No lights added yet" },
  "lights.presetColors": { pt: "Cores Predefinidas", en: "Preset Colors" },
  "lights.warmWhite": { pt: "Branco Quente", en: "Warm White" },
  "lights.coolWhite": { pt: "Branco Frio", en: "Cool White" },
  "lights.red": { pt: "Vermelho", en: "Red" },
  "lights.green": { pt: "Verde", en: "Green" },
  "lights.blue": { pt: "Azul", en: "Blue" },
  "lights.purple": { pt: "Roxo", en: "Purple" },

  // TVs
  "tvs.title": { pt: "Televisões", en: "TVs" },
  "tvs.addTV": { pt: "Adicionar TV", en: "Add TV" },
  "tvs.currentVideo": { pt: "Vídeo Atual", en: "Current Video" },
  "tvs.noVideo": { pt: "Sem vídeo", en: "No video" },
  "tvs.loopPlayback": { pt: "Reprodução em loop", en: "Loop playback" },
  "tvs.noTVs": { pt: "Ainda sem TVs adicionadas", en: "No TVs added yet" },
  "tvs.selectVideo": { pt: "Selecione um vídeo", en: "Select a video" },

  // Stores
  "stores.title": { pt: "Lojas", en: "Stores" },
  "stores.subtitle": { pt: "Gestão de lojas e espaços", en: "Store and space management" },
  "stores.addStore": { pt: "Adicionar Loja", en: "Add Store" },
  "stores.addSpace": { pt: "Adicionar Espaço", en: "Add Space" },
  "stores.noStores": { pt: "Sem lojas criadas", en: "No stores created" },
  "stores.noSpaces": { pt: "Sem espaços", en: "No spaces" },
  "stores.searchPlaceholder": { pt: "Pesquisar lojas...", en: "Search stores..." },

  // Members
  "members.title": { pt: "Membros", en: "Members" },
  "members.subtitle": { pt: "Gerir membros e permissões das suas organizações", en: "Manage members and permissions of your organizations" },
  "members.addMember": { pt: "Adicionar Membro", en: "Add Member" },
  "members.createUser": { pt: "Criar Utilizador", en: "Create User" },
  "members.invite": { pt: "Convidar", en: "Invite" },
  "members.role": { pt: "Função", en: "Role" },
  "members.owner": { pt: "Proprietário", en: "Owner" },
  "members.admin": { pt: "Administrador", en: "Admin" },
  "members.member": { pt: "Membro", en: "Member" },
  "members.memberSince": { pt: "Membro desde", en: "Member since" },
  "members.totalMembers": { pt: "Total de Membros", en: "Total Members" },
  "members.administrators": { pt: "Administradores", en: "Administrators" },
  "members.activeInvites": { pt: "Convites Ativos", en: "Active Invites" },
  "members.usedInvites": { pt: "Convites Usados", en: "Used Invites" },
  "members.inviteLink": { pt: "Link de Convite", en: "Invite Link" },
  "members.storePermissions": { pt: "Permissões por Loja", en: "Store Permissions" },
  "members.canView": { pt: "Ver", en: "View" },
  "members.canEdit": { pt: "Editar", en: "Edit" },
  "members.allStores": { pt: "Todas", en: "All" },
  "members.noPermissions": { pt: "Nenhuma", en: "None" },
  "members.manageStores": { pt: "Gerir Lojas", en: "Manage Stores" },
  "members.changeRole": { pt: "Alterar Função", en: "Change Role" },
  "members.remove": { pt: "Remover", en: "Remove" },

  // Organizations
  "organizations.title": { pt: "Organizações", en: "Organizations" },
  "organizations.subtitle": { pt: "Gerir as suas organizações", en: "Manage your organizations" },
  "organizations.createOrg": { pt: "Criar Organização", en: "Create Organization" },
  "organizations.noOrgs": { pt: "Sem organizações", en: "No organizations" },
  "organizations.joinOrg": { pt: "Juntar-se a uma Organização", en: "Join an Organization" },

  // Activity Logs
  "logs.title": { pt: "Logs de Atividade", en: "Activity Logs" },
  "logs.subtitle": { pt: "Histórico de ações realizadas", en: "History of actions performed" },
  "logs.action": { pt: "Ação", en: "Action" },
  "logs.user": { pt: "Utilizador", en: "User" },
  "logs.entity": { pt: "Entidade", en: "Entity" },
  "logs.timestamp": { pt: "Data/Hora", en: "Timestamp" },
  "logs.details": { pt: "Detalhes", en: "Details" },
  "logs.noLogs": { pt: "Sem logs de atividade", en: "No activity logs" },
  "logs.filterByAction": { pt: "Filtrar por ação", en: "Filter by action" },
  "logs.filterByUser": { pt: "Filtrar por utilizador", en: "Filter by user" },
  "logs.lightOn": { pt: "Luz ligada", en: "Light turned on" },
  "logs.lightOff": { pt: "Luz desligada", en: "Light turned off" },
  "logs.brightnessChanged": { pt: "Brilho alterado", en: "Brightness changed" },
  "logs.colorChanged": { pt: "Cor alterada", en: "Color changed" },
  "logs.scheduleCreated": { pt: "Agendamento criado", en: "Schedule created" },
  "logs.scheduleDeleted": { pt: "Agendamento eliminado", en: "Schedule deleted" },
  "logs.userCreated": { pt: "Utilizador criado", en: "User created" },
  "logs.userInvited": { pt: "Utilizador convidado", en: "User invited" },

  // Location Detail
  "location.controlDashboard": { pt: "Dashboard de Controlo", en: "Control Dashboard" },
  "location.realTimeMonitoring": { pt: "Monitorização e controlo em tempo real", en: "Real-time monitoring and control" },
  "location.fullscreen": { pt: "Ecrã Inteiro", en: "Fullscreen" },
  "location.exitFullscreen": { pt: "Sair do Ecrã Inteiro", en: "Exit Fullscreen" },

  // Auth
  "auth.login": { pt: "Entrar", en: "Login" },
  "auth.logout": { pt: "Sair", en: "Logout" },
  "auth.register": { pt: "Registar", en: "Register" },
  "auth.username": { pt: "Nome de utilizador", en: "Username" },
  "auth.email": { pt: "Email", en: "Email" },
  "auth.password": { pt: "Password", en: "Password" },
  "auth.confirmPassword": { pt: "Confirmar Password", en: "Confirm Password" },
  "auth.forgotPassword": { pt: "Esqueci a Password", en: "Forgot Password" },
  "auth.noAccount": { pt: "Não tem conta?", en: "Don't have an account?" },
  "auth.haveAccount": { pt: "Já tem conta?", en: "Already have an account?" },
  "auth.profile": { pt: "Perfil", en: "Profile" },
  "auth.settings": { pt: "Definições", en: "Settings" },

  // Time
  "time.today": { pt: "Hoje", en: "Today" },
  "time.yesterday": { pt: "Ontem", en: "Yesterday" },
  "time.lastWeek": { pt: "Última semana", en: "Last week" },
  "time.lastMonth": { pt: "Último mês", en: "Last month" },
  "time.lastYear": { pt: "Último ano", en: "Last year" },
  "time.hours": { pt: "horas", en: "hours" },
  "time.minutes": { pt: "minutos", en: "minutes" },
  "time.seconds": { pt: "segundos", en: "seconds" },
  "time.ago": { pt: "atrás", en: "ago" },

  // Errors
  "error.notFound": { pt: "Não encontrado", en: "Not found" },
  "error.unauthorized": { pt: "Não autorizado", en: "Unauthorized" },
  "error.forbidden": { pt: "Acesso negado", en: "Access denied" },
  "error.serverError": { pt: "Erro do servidor", en: "Server error" },
  "error.networkError": { pt: "Erro de rede", en: "Network error" },
  "error.validationError": { pt: "Erro de validação", en: "Validation error" },
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("language");
    if (saved === "en" || saved === "pt" || saved === "es" || saved === "fr") return saved;
    return "en";
  });

  useEffect(() => {
    localStorage.setItem("language", language);
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string, params?: Record<string, string | number>): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Missing translation for key: ${key}`);
      return key;
    }
    
    let text = translation[language] ?? translation.en;
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        text = text.replace(`{${key}}`, String(value));
      });
    }
    
    return text;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function useTranslation() {
  return useI18n();
}
