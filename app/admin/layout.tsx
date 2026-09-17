import { AutomationProvider } from "@/components/AutomationProvider";
import { Shell } from "@/components/Shell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AutomationProvider>
      <Shell>{children}</Shell>
    </AutomationProvider>
  );
}
