"use client";

import { useState } from "react";
import { MessageCircle, Mail, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { waLink, mailtoLink } from "@/lib/messaging";
import { toast } from "sonner";

export function SendMessageDialog({
  open,
  onOpenChange,
  title,
  subject,
  message,
  phone,
  email,
  defaultLink,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject: string;
  message: string;
  phone?: string | null;
  email?: string | null;
  defaultLink?: string | null;
  /**
   * Fires when the owner hands the message off to WhatsApp or email. That is
   * the last moment this app can observe: it means "opened in WhatsApp", not
   * "delivered", and is recorded that way.
   */
  onSent?: (channel: "whatsapp" | "email") => void;
}) {
  const [link, setLink] = useState(defaultLink || "");
  const fullMessage = link ? `${message}\n\nPay here: ${link}` : message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">{fullMessage}</div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payment or info link (optional)
          </label>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </div>
        <div className="flex flex-col gap-2 pt-1">
          {phone ? (
            <a
              href={waLink(phone, fullMessage)}
              target="_blank"
              rel="noreferrer"
              onClick={() => onSent?.("whatsapp")}
            >
              <Button className="w-full">
                <MessageCircle className="h-4 w-4" /> Send on WhatsApp ({phone})
              </Button>
            </a>
          ) : (
            <p className="text-xs text-destructive">No phone number on file for WhatsApp.</p>
          )}
          {email ? (
            <a href={mailtoLink(email, subject, fullMessage)} onClick={() => onSent?.("email")}>
              <Button variant="outline" className="w-full">
                <Mail className="h-4 w-4" /> Send via email ({email})
              </Button>
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No email on file.</p>
          )}
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              navigator.clipboard?.writeText(fullMessage);
              toast.success("Copied to clipboard");
            }}
          >
            <Copy className="h-4 w-4" /> Copy message
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
