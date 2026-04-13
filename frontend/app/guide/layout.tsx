import { ChannelsProvider } from "@/context/channels-context";

export default function LiveLayout({ children }: { children: React.ReactNode }) {
    return (
        <ChannelsProvider>
            {children}
        </ChannelsProvider>
    );
}