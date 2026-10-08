"use client";

import { useEffect } from "react";
import { useAppSession } from "@/app/lib/useAppSession";
import { setCurrentUser } from "../lib/userState";

export default function SessionWatcher() {
  const { data: session } = useAppSession();
  useEffect(() => {
    setCurrentUser(session?.user?.email ?? null);
  }, [session]);
  return null;
}
