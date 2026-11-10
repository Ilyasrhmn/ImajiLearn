import SessionGate from "../../components/session-gate";
import MobileShell from "../../components/mobile-shell";
export default function Layout({ children }) { return <SessionGate><MobileShell>{children}</MobileShell></SessionGate>; }
