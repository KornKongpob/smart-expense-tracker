"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import LoadingScreen from "../src/features/app/screens/LoadingScreen.jsx";
import { getInitialHomePath } from "../src/features/app/routes.js";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const targetPath = getInitialHomePath({
      pathname: window.location.pathname,
      hash: window.location.hash,
    });
    router.replace(targetPath);
  }, [router]);

  return <LoadingScreen label="กำลังเปิดแอป" />;
}
