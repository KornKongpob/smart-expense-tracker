"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getPathForLegacyHash } from "../app/routes.js";

export default function LegacyHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const targetPath = getPathForLegacyHash(window.location.hash);
    if (!targetPath) return;

    router.replace(targetPath);
  }, [router]);

  return null;
}
