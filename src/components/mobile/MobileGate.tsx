import { Navigate } from "react-router-dom";
import { useMediaQuery } from "@/lib/use-media-query";
import MobileHome from "./MobileHome";

export default function MobileGate() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  if (isDesktop) return <Navigate to="/" replace />;
  return <MobileHome />;
}
