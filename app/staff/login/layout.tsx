import type { Metadata } from "next";

// The login page is a client component and cannot export metadata itself;
// this passthrough layout gives the route a distinct title (WCAG 2.4.2).
export const metadata: Metadata = {
  title: "Staff Sign In — Lost & Found",
};

export default function StaffLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
