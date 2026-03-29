"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  Loading01Icon,
  AlertCircleIcon,
  AlertTriangle,
} from "@hugeicons/core-free-icons";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} />,
        info: <HugeiconsIcon icon={InformationCircleIcon} size={16} />,
        warning: <HugeiconsIcon icon={AlertTriangle} size={16} />,
        error: <HugeiconsIcon icon={AlertCircleIcon} size={16} />,
        loading: (
          <HugeiconsIcon
            icon={Loading01Icon}
            size={16}
            className="animate-spin"
          />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
