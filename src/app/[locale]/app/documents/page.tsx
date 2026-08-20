import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { DocumentUploadForm } from '@/components/forms/document-upload-form';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org && !user.platformRole) return null;

  const documents = await prisma.document.findMany({
    where: { deletedAt: null, ...(user.platformRole ? {} : { ownerOrgId: user.org!.id }) },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('documents.title')}</h1>

      <Card>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('documents.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('documents.docType')}</Th>
                  <Th>{t('documents.file')}</Th>
                  <Th>{t('documents.size')}</Th>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th>{t('common.actions')}</Th>
                </Tr>
              </THead>
              <TBody>
                {documents.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium">{d.type.replaceAll('_', ' ')}</Td>
                    <Td>
                      <span className="block max-w-56 truncate" title={d.fileName}>
                        {d.fileName}
                      </span>
                      <span className="block font-mono text-[10px] text-slate-400">
                        {d.sha256.slice(0, 16)}…
                      </span>
                    </Td>
                    <Td className="tabular-nums">{(d.sizeBytes / 1024).toFixed(0)} KB</Td>
                    <Td className="tabular-nums">{formatDate(d.createdAt, locale)}</Td>
                    <Td>
                      <Badge tone={toneForStatus(d.status)}>{d.status}</Badge>
                    </Td>
                    <Td>
                      <a
                        href={`/api/v1/documents/${d.id}/download`}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        {t('documents.download')}
                      </a>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {user.org ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('documents.upload')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentUploadForm maxMb={env().MAX_UPLOAD_MB} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
