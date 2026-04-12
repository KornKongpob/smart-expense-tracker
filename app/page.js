"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import LoadingScreen from "../src/features/app/screens/LoadingScreen.jsx";
import { getPathForLegacyHash } from "../src/features/app/routes.js";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const targetPath = getPathForLegacyHash(window.location.hash) || "/dashboard";
    router.replace(targetPath);
  }, [router]);

  return <LoadingScreen label="กำลังเปิดแอป" />;
}
