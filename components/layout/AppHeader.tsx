import AppNavbar from './AppNavbar';
import { AppView, Environment } from '../../interfaces/enums';

interface AppHeaderProps {
    appView: AppView;
    environment: Environment;
    totalLogCount: number;
    onViewChange: (view: AppView) => void;
    onEnvironmentChange: (env: Environment) => void;
    onExport: () => void;
    onSettingsOpen: () => void;
}

export default function AppHeader({
    appView,
    environment,
    totalLogCount,
    onViewChange,
    onEnvironmentChange,
    onExport,
    onSettingsOpen
}: AppHeaderProps) {
    return (
        <AppNavbar
            appView={appView}
            environment={environment}
            totalLogCount={totalLogCount}
            onViewChange={onViewChange}
            onEnvironmentChange={onEnvironmentChange}
            onExport={onExport}
            onSettingsOpen={onSettingsOpen}
        />
    );
}
