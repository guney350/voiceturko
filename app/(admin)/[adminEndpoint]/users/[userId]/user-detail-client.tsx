'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bot, Network, Phone, FileText, Clock } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AssistantForm,
  DeleteAssistant,
  SipForm,
  DeleteSip
} from '@/components/admin/user-data-management'

interface UserDetailClientProps {
  userId: string
  assistants: any[]
  sips: any[]
  calls: any[]
  invoices: any[]
  minutePurchases: any[]
  campaigns?: any[]
}

export function UserDetailClient({
  userId,
  assistants,
  sips,
  calls,
  campaigns = [],
}: UserDetailClientProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Detaylı Bilgiler</CardTitle>
        <CardDescription>Kullanıcının tüm verileri</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="assistants" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="assistants">Asistanlar ({(assistants || []).length})</TabsTrigger>
            <TabsTrigger value="sips">SIP Bağlantıları ({(sips || []).length})</TabsTrigger>
            <TabsTrigger value="campaigns">Kampanyalar ({(campaigns || []).length})</TabsTrigger>
            <TabsTrigger value="calls">Son Çağrılar</TabsTrigger>
          </TabsList>

          {/* Assistants Tab */}
          <TabsContent value="assistants" className="space-y-4">
            <div className="flex justify-end">
              <AssistantForm userId={userId} onSuccess={() => window.location.reload()} />
            </div>
            {assistants && assistants.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>İsim</TableHead>
                    <TableHead>İlk Mesaj Modu</TableHead>
                    <TableHead>Voice ID</TableHead>
                    <TableHead>Oluşturulma</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assistants.map((assistant) => (
                    <TableRow key={assistant.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                          {assistant.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{assistant.first_message_mode}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {assistant.voice_id || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(assistant.created_at).toLocaleDateString('tr-TR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <AssistantForm userId={userId} assistant={assistant} onSuccess={() => window.location.reload()} />
                          <DeleteAssistant id={assistant.id} onSuccess={() => window.location.reload()} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">Asistan bulunamadı</p>
            )}
          </TabsContent>

          {/* SIPs Tab */}
          <TabsContent value="sips" className="space-y-4">
            <div className="flex justify-end">
              <SipForm userId={userId} onSuccess={() => window.location.reload()} />
            </div>
            {sips && sips.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>İsim</TableHead>
                    <TableHead>IP Adresi</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>Kullanıcı Adı</TableHead>
                    <TableHead>Oluşturulma</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sips.map((sip) => (
                    <TableRow key={sip.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Network className="h-4 w-4 text-muted-foreground" />
                          {sip.name}
                        </div>
                      </TableCell>
                      <TableCell>{sip.ip_address}</TableCell>
                      <TableCell>{sip.port}</TableCell>
                      <TableCell>{sip.username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(sip.created_at).toLocaleDateString('tr-TR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <SipForm userId={userId} sip={sip} onSuccess={() => window.location.reload()} />
                          <DeleteSip id={sip.id} onSuccess={() => window.location.reload()} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">SIP bulunamadı</p>
            )}
          </TabsContent>

          {/* Calls Tab */}
          <TabsContent value="calls" className="space-y-4">
            {calls && calls.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Süre</TableHead>
                    <TableHead>Transkript</TableHead>
                    <TableHead>Analiz</TableHead>
                    <TableHead>Tarih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => (
                    <TableRow key={call.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {call.duration_minutes.toFixed(2)} dk
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={call.transcript ? 'default' : 'secondary'}>
                          {call.transcript ? 'Var' : 'Yok'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={call.analysis ? 'default' : 'secondary'}>
                          {call.analysis ? 'Var' : 'Yok'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(call.created_at).toLocaleString('tr-TR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">Çağrı bulunamadı</p>
            )}
          </TabsContent>

          {/* Invoices Tab */}
          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            {campaigns && campaigns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kampanya</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>İlerleme</TableHead>
                    <TableHead>Tarih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const pct = c.total_contacts > 0 ? Math.round((c.completed_calls / c.total_contacts) * 100) : 0
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {c.status === 'running' ? 'Çalışıyor' :
                             c.status === 'completed' ? 'Tamamlandı' :
                             c.status === 'paused' ? 'Duraklatıldı' :
                             c.status === 'draft' ? 'Taslak' : c.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="tabular-nums">{c.completed_calls}/{c.total_contacts}</span>
                            <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-muted-foreground tabular-nums">{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString('tr-TR')}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">Kampanya bulunamadı</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}