import FeedAnalyticsPanel, { FeedAnalyticsPanelProps } from './FeedAnalyticsPanel';
import SidebarPanel, { SidebarPanelProps } from './SidebarPanel';
import VerifierContent, { VerifierContentProps } from './VerifierContent';
import { AppView } from '../../interfaces/enums';

interface AppMainContentProps {
    appView: AppView;
    verifierProps: VerifierContentProps;
    sidebarProps: SidebarPanelProps;
    feedProps: FeedAnalyticsPanelProps;
}

export default function AppMainContent({
    appView,
    verifierProps,
    sidebarProps,
    feedProps
}: AppMainContentProps) {
    if (appView === AppView.Verifier) {
        return (
            <main className="max-w-7xl mx-auto p-4 mt-4 pb-20">
                <VerifierContent {...verifierProps} />
            </main>
        );
    }

    return (
        <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4 pb-20">
            <SidebarPanel {...sidebarProps} />
            <FeedAnalyticsPanel {...feedProps} />
        </main>
    );
}
