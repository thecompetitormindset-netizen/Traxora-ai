"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { setCurrentUser } from "../lib/userState";

export default function SessionWatcher() {
  const { data: session } = useSession();
  useEffect(() => {
    setCurrentUser(session?.user?.email ?? null);
  }, [session]);
  return null;
}
