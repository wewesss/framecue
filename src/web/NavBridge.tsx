import { NavProvider } from "@standarx/nav/react";
import { type NavActions, navPlugins, useAppNav } from "./nav";

function Bridge({ actions }: { actions: () => NavActions }) {
  useAppNav(actions);
  return null;
}

export function NavBridge({ actions }: { actions: () => NavActions }) {
  return (
    <NavProvider plugins={navPlugins}>
      <Bridge actions={actions} />
    </NavProvider>
  );
}
