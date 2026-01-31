import type { MouseEvent } from 'react';
import CloudLoadModal from '../modals/CloudLoadModal';
import OverwriteModal from '../modals/OverwriteModal';
import SettingsPanel from '../SettingsPanel';
import { ToastContainer } from '../Toast';
import { ConfirmModalContainer } from '../ConfirmModal';
import { SavedSession } from '../../services/firebaseService';

interface AppOverlaysProps {
    showCloudLoadModal: boolean;
    cloudSessions: SavedSession[];
    isCloudLoading: boolean;
    onCloudSelect: (session: SavedSession) => void;
    onCloudDelete: (sessionId: string, event: MouseEvent) => void;
    onCloudClose: () => void;
    showOverwriteModal: boolean;
    totalLogCount: number;
    onOverwriteDownloadAndContinue: () => void;
    onOverwriteContinue: () => void;
    onOverwriteStartNew: () => void;
    onOverwriteCancel: () => void;
    showSettings: boolean;
    onSettingsClose: () => void;
    onSettingsChanged: () => Promise<void>;
}

export default function AppOverlays({
    showCloudLoadModal,
    cloudSessions,
    isCloudLoading,
    onCloudSelect,
    onCloudDelete,
    onCloudClose,
    showOverwriteModal,
    totalLogCount,
    onOverwriteDownloadAndContinue,
    onOverwriteContinue,
    onOverwriteStartNew,
    onOverwriteCancel,
    showSettings,
    onSettingsClose,
    onSettingsChanged
}: AppOverlaysProps) {
    return (
        <>
            <CloudLoadModal
                isOpen={showCloudLoadModal}
                sessions={cloudSessions}
                isLoading={isCloudLoading}
                onSelect={onCloudSelect}
                onDelete={onCloudDelete}
                onClose={onCloudClose}
            />

            <OverwriteModal
                isOpen={showOverwriteModal}
                totalLogCount={totalLogCount}
                onDownloadAndContinue={onOverwriteDownloadAndContinue}
                onContinue={onOverwriteContinue}
                onStartNew={onOverwriteStartNew}
                onCancel={onOverwriteCancel}
            />

            <SettingsPanel
                isOpen={showSettings}
                onClose={onSettingsClose}
                onSettingsChanged={onSettingsChanged}
            />

            <ToastContainer />
            <ConfirmModalContainer />
        </>
    );
}
