"use client";

import { createContext, useContext, useState } from "react";
import { updateOwnerName } from "@/app/actions/settings";

const ManagerContext = createContext<{
  manager: string;
  setManager: (name: string) => void;
}>({ manager: "Owner", setManager: () => {} });

export function ManagerProvider({
  children,
  initialOwnerName,
}: {
  children: React.ReactNode;
  initialOwnerName: string;
}) {
  const [manager, setManagerState] = useState(initialOwnerName);

  function setManager(name: string) {
    const trimmed = name.trim() || "Owner";
    setManagerState(trimmed);
    updateOwnerName(trimmed);
  }

  return <ManagerContext.Provider value={{ manager, setManager }}>{children}</ManagerContext.Provider>;
}

export function useManager() {
  return useContext(ManagerContext);
}
