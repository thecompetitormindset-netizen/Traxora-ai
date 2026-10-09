import { redirect } from "next/navigation";

// Traxora no longer has paid plans; old /pricing links land on the home page.
export default function PricingPage() {
  redirect("/");
}
