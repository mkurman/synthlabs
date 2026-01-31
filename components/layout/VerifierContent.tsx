import VerifierPanel from '../VerifierPanel';
import { ExternalProvider, ProviderType } from '../../interfaces/enums';

export interface VerifierContentProps {
    sessionUid: string;
    provider: ProviderType;
    externalProvider: ExternalProvider;
    externalModel: string;
    externalApiKey: string;
}

export default function VerifierContent({
    sessionUid,
    provider,
    externalProvider,
    externalModel,
    externalApiKey
}: VerifierContentProps) {
    return (
        <VerifierPanel
            currentSessionUid={sessionUid}
            modelConfig={{
                provider,
                externalProvider,
                externalModel,
                apiKey: provider === ProviderType.External ? externalApiKey : '',
                externalApiKey
            }}
        />
    );
}
