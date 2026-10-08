import { AuthProvider } from "@/context/auth-context";
import { AuthShell } from "@/components/auth/auth-shell";

export default function Home() {
  return (
    <AuthProvider>
      <AuthShell />
    </AuthProvider>
  );
}
