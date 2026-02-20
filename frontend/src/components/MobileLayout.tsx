import BottomNav from "./BottomNav";

const MobileLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-background">
    <main className="flex-1 overflow-y-auto pb-32">{children}</main>
    <BottomNav />
  </div>
);

export default MobileLayout;
