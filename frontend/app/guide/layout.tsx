import { ChannelsProvider } from "@/context/channels-context";

export default function GuideLayout({ children }: { children: React.ReactNode }) {
    return (
        <ChannelsProvider>
            {children}
        </ChannelsProvider>
    );
}