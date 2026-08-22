import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTranslation } from "@/lib/i18n";

export default function FurnitureDetailPage() {
  const [, params] = useRoute("/furniture/:furnitureId");
  const furnitureId = params?.furnitureId ?? "";
  const { language } = useTranslation();
  const tr = (pt: string, en: string) => (language === "pt" ? pt : en);
  const { toast } = useToast();
  const { canManageHierarchy } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { data: item } = useQuery<any>({
    queryKey: ["/api/furniture", furnitureId],
    enabled: !!furnitureId,
  });

  const { data: kits = [] } = useQuery<any[]>({
    queryKey: ["/api/kits", { furnitureId }],
    queryFn: () => apiJson("GET", `/api/kits?furnitureId=${furnitureId}`),
    enabled: !!furnitureId,
  });

  const createKit = useMutation({
    mutationFn: () => apiJson("POST", "/api/kits", { furnitureId, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kits"] });
      setOpen(false);
      setName("");
      toast({ title: tr("Kit criado", "Kit created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!item) return <p className="text-muted-foreground">{tr("A carregar…", "Loading…")}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Breadcrumbs
            items={[
              { label: tr("Lojas", "Stores"), href: "/stores" },
              { label: item.name },
            ]}
          />
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{item.name}</h1>
            <StatusBadge status={item.status} />
          </div>
          <p className="font-mono text-sm text-muted-foreground">{item.furnitureCode}</p>
        </div>
        {canManageHierarchy ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {tr("Novo kit", "New kit")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Criar kit", "Create kit")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>{tr("Nome", "Name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <DialogFooter>
              <Button disabled={!name} onClick={() => createKit.mutate()}>
                {tr("Criar", "Create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      <div className="rounded-lg border divide-y">
        {kits.map((k) => (
          <Link
            key={k.id}
            href={`/kits/${k.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
          >
            <div>
              <div className="font-medium">{k.name}</div>
              <div className="text-xs font-mono text-muted-foreground">{k.kitCode}</div>
            </div>
            <StatusBadge status={k.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
