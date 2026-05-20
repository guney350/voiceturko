'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import Link from 'next/link'
import {
  HelpCircle, PhoneCall, Bot, AlertCircle, Lightbulb,
  MessageCircle, Network, Wallet, Sparkles, ArrowRight,
} from 'lucide-react'

const SECTIONS = [
  {
    id: 'getting-started',
    icon: Sparkles,
    title: 'Hızlı Başlangıç',
    color: 'text-primary',
    items: [
      {
        q: 'Sıfırdan nasıl başlarım?',
        a: 'Adım adım: 1) **Bakiye/Paket alın** (`/dashboard/credits` veya `/dashboard/packages`). Yeni kayıt olduğunuzda otomatik olarak 10 TL hoşgeldin kredisi tanımlanır. 2) **SIP bağlantısı ekleyin** (`/dashboard/sip`). SIP sağlayıcınızın bilgilerini (IP, port, kullanıcı adı, şifre, telefon) girersiniz. 3) **Yapay zeka asistanı oluşturun** (`/dashboard/assistant/new`). Hazır şablonlardan birini seçerek dakikalar içinde tamamlarsınız. 4) **Kampanya başlatın** (`/dashboard/campaigns/create`). Excel/CSV ile müşteri listesini yükleyip kampanyayı çalıştırırsınız.',
      },
      {
        q: 'Sistem genel olarak nasıl çalışıyor?',
        a: 'Sisteme kayıt olduğunuzda **10 adet özel arama hattı** size otomatik olarak tahsis edilir. Her hat aynı anda **10 görüşme** gerçekleştirebilir; toplamda **100 eşzamanlı arama** kapasitesine sahip olursunuz. Görüşmeler, paket dakikanızdan veya kredi bakiyenizden tahsil edilir. Tüm aramalar ses kaydı ve yazılı transkript ile arşivlenir.',
      },
      {
        q: 'Fiyatlandırma yapısı nasıldır?',
        a: '**Başlangıç paketi (otomatik atanır)**: 10 TL/dakika, kullandıkça öde modeli. **İndirimli paketler**: 10.000 dk → 7 TL/dk, 30.000 dk → 5 TL/dk, 50.000 dk → 4 TL/dk, 100.000 dk → 3 TL/dk. Paket dakikanız bittiğinde aşım, otomatik olarak kredi bakiyenizden 10 TL/dk üzerinden tahsil edilir.',
      },
    ],
  },
  {
    id: 'sip',
    icon: Network,
    title: 'SIP / Telefon Bağlantısı',
    color: 'text-blue-600',
    items: [
      {
        q: 'SIP nedir? Neden gereklidir?',
        a: 'SIP (Session Initiation Protocol), internet üzerinden telefon görüşmesi yapmayı sağlayan protokoldür. Aramaların müşterilerinize ulaşabilmesi için bir SIP sağlayıcısı ile sözleşmenizin olması ve bilgilerinin sisteme girilmesi gerekir.',
      },
      {
        q: 'SIP nereden alınır?',
        a: 'Türkiye\'deki popüler SIP sağlayıcıları: **Karel** (kurumsal), **NetGSM** (KOBİ\'ler için ideal), **Türk Telekom** (geniş ağ), **Vodafone NetCloud**, **Turkcell Şirketim**. Sağlayıcı seçip hesap aldıktan sonra size IP adresi, port (genelde 5060), kullanıcı adı, şifre ve telefon numarası verilir.',
      },
      {
        q: 'SIP form alanlarının anlamı nedir?',
        a: '**İsim**: Sadece sizin göreceğiniz etiket (örneğin "Ofis Hattı"). **IP Adresi**: Sağlayıcınızın gateway IP adresi. **Port**: Genellikle 5060. **Kullanıcı Adı**: Genelde telefon numaranızın rakamları (örn. 903129552013). **Şifre**: Sağlayıcıdan size verilen güvenli şifre. **Telefon Numarası**: E.164 formatında (+ ile başlayan, otomatik üretilir).',
      },
      {
        q: 'SIP eklendiğinde ne olur?',
        a: '10 sistem hattınızın tümüne SIP bilgileriniz birden otomatik olarak tanımlanır (yaklaşık 30 saniye sürer). Bundan sonra başlattığınız kampanyalarda çağrılar bu numaranızdan çıkar.',
      },
    ],
  },
  {
    id: 'assistant',
    icon: Bot,
    title: 'Yapay Zeka Asistanı',
    color: 'text-purple-600',
    items: [
      {
        q: 'Yapay zeka asistanı nedir?',
        a: 'Türkçe konuşan, gerçek insan sesiyle iletişim kuran yapay zeka karakteridir. Müşterilerinizle telefonda görüşür, sorular sorar, yanıt verir. Anket, randevu, satış ve bilgilendirme senaryolarında etkin biçimde kullanılır.',
      },
      {
        q: 'Asistan nasıl oluştururum?',
        a: 'En kolay yöntem: [Şablondan oluştur](/dashboard/assistant/new) sayfasına gidin → sektörünüzü seçin (Otel, Diş Hekimi, Emlak vb.) → uygun şablonu belirleyin → ilgili alanları (firma adı, asistan ismi vb.) doldurun → oluşturun. Sistem prompt, ses motoru ve model gibi teknik ayarlar otomatik olarak yapılandırılır.',
      },
      {
        q: 'Birden fazla asistanım olabilir mi?',
        a: 'Evet. Her kampanya için farklı asistan kullanabilirsiniz. Örneğin anket için "Esra", satış için "Mehmet", randevu hatırlatma için "Sevgi" şeklinde özelleştirebilirsiniz.',
      },
    ],
  },
  {
    id: 'campaigns',
    icon: PhoneCall,
    title: 'Kampanyalar (Toplu Arama)',
    color: 'text-emerald-600',
    items: [
      {
        q: 'Kampanya nasıl başlatılır?',
        a: '1) `/dashboard/campaigns/create` sayfasına gidin. 2) Kampanya adı ve asistanı seçin. 3) Excel/CSV dosyanızı yükleyin (müşteri listesi). 4) Eşzamanlı arama sayısını belirleyin (1-100). 5) "Oluştur ve Hemen Başlat" butonu ile çağrılar otomatik olarak başlar.',
      },
      {
        q: 'Excel formatı nasıl olmalıdır?',
        a: 'Sistemimiz **akıllı format tanıma** özelliğine sahiptir. Sütun başlıklarınızı (İsim/Ad/Müşteri Adı, Telefon/GSM/Tel vb.) otomatik tanır. Asistanınızın hangi alanları beklediğini, kampanya oluşturma sayfasındaki rehberden görebilirsiniz. Örnek Excel dosyasını da yine aynı sayfadan indirebilirsiniz.',
      },
      {
        q: 'Eşzamanlı arama nedir?',
        a: 'Aynı anda kaç telefonun çalacağını belirler. Örneğin 50 olarak ayarlarsanız, her seferinde 50 müşteri eş zamanlı olarak aranır; bir arama bittiğinde yenisi başlar. Maksimum değer 100\'dür (10 hat × her hatta 10 eşzamanlı arama).',
      },
      {
        q: 'Arama bittikten sonra ne olur?',
        a: 'Tüm aramalar `/dashboard/calls` sayfasında listelenir. Her arama için: ses kaydı (dinleyebilirsiniz), transkript (yazılı metin), yapay zeka analizi (özet ve değerlendirme), süre ve maliyet bilgileri sunulur.',
      },
    ],
  },
  {
    id: 'billing',
    icon: Wallet,
    title: 'Ödeme ve Bakiye',
    color: 'text-amber-600',
    items: [
      {
        q: 'Hangi ödeme yöntemleri desteklenir?',
        a: '**Kredi Kartı** (Stripe altyapısı ile güvenli ödeme), **Kripto Para** (Oxapay üzerinden BTC, ETH, USDT vb.). Havale/EFT seçeneği için canlı destek ekibimizle iletişime geçebilirsiniz.',
      },
      {
        q: 'Paket ile kredi arasındaki fark nedir?',
        a: '**Paket**: Tek seferde dakika satın alırsınız (10K, 30K, 50K, 100K). İndirimli fiyatlandırma sunar. Kullandıkça aşağı düşer. **Kredi**: TL bakiyesi yüklersiniz. Dakika başına tahsil edilir (10 TL/dk). Daha esnek ancak fiyatı daha yüksektir. **Önerilen kullanım**: Yoğun arama yapacaksanız paket, düşük hacimli kullanım için kredi tercih edin.',
      },
      {
        q: 'Bakiyemi nasıl görüntülerim?',
        a: 'Dashboard\'da "Kredi Bakiyem" kartı her zaman gerçek zamanlı olarak gösterilir. Detaylı işlem geçmişi için `/dashboard/credits` sayfasını ziyaret edebilirsiniz.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    icon: AlertCircle,
    title: 'Sorun Giderme',
    color: 'text-red-600',
    items: [
      {
        q: 'Aramalar başlamıyor',
        a: 'Lütfen aşağıdakileri kontrol edin: Yeterli bakiyeniz var mı? (Dashboard\'daki bakiye kartı). SIP bağlantısı eklenmiş mi? (`/dashboard/sip`). En az bir asistan oluşturuldu mu? (`/dashboard/assistant`). Kampanya durumu "Çalışıyor" mu?',
      },
      {
        q: 'Aramalar erken kapanıyor',
        a: 'İki yaygın sebebi vardır. 1) Sistem prompt\'unda "end_call_tool" ifadesi geçiyorsa, çıkarmanız önerilir. 2) Asistan ayarlarınızda "End Call Tool" aktifse ve model bunu yanlış çağırıyorsa, ilgili seçeneği kapatın.',
      },
      {
        q: 'Müşteri bilgileri ve transkript görünmüyor',
        a: 'Sistem her 15 saniyede bir arka planda otomatik senkronizasyon yapar. Ayrıca arama listesindeki "Tüm Aktif Aramaları Yenile" butonuyla manuel tetikleyebilirsiniz. Webhook gecikmesi durumunda bile bilgileriniz en geç birkaç dakika içinde güncellenir.',
      },
      {
        q: 'Sorun çözülmüyor',
        a: 'Sağ alttaki yardım butonuna tıklayarak sohbet asistanımıza ulaşabilir, gerekirse "Canlı Desteğe Bağlan" seçeneği ile teknik ekibimize doğrudan ulaştırabilirsiniz. Görüşme kaydınız ekibimize iletilir ve en kısa sürede dönüş yapılır.',
      },
    ],
  },
]

export default function HelpPage() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <HelpCircle className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Yardım Merkezi</h1>
            <p className="text-sm text-muted-foreground">Sık sorulan sorular ve kullanım rehberi</p>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {/* Hızlı erişim */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 shrink-0">
                <Lightbulb className="w-4 h-4 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">İlk kez mi geldiniz?</p>
                <p className="text-xs text-muted-foreground">
                  Aşağıdaki rehber adımlarını takip edin veya{' '}
                  <Link href="/dashboard" className="text-primary hover:underline inline-flex items-center gap-0.5">
                    Dashboard&apos;daki başlangıç rehberini
                    <ArrowRight className="w-3 h-3" />
                  </Link>{' '}
                  kullanın.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sections */}
        <div className="space-y-6">
          {SECTIONS.map(section => {
            const Icon = section.icon
            return (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className={`w-5 h-5 ${section.color}`} />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {section.items.map((item, i) => (
                      <AccordionItem key={i} value={`${section.id}-${i}`}>
                        <AccordionTrigger className="text-left text-sm">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
                            dangerouslySetInnerHTML={{
                              __html: item.a
                                .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
                                .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
                                .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>')
                                .replace(/\n\n/g, '<br><br>')
                                .replace(/\n/g, '<br>'),
                            }}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Footer */}
        <Card className="mt-6 border-primary/30">
          <CardContent className="p-6 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <MessageCircle className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold">Cevabınızı bulamadınız mı?</h3>
              <p className="text-sm text-muted-foreground">
                Sağ alttaki sohbet asistanımız 7/24 hizmetinizdedir.
                Canlı destek ekibimize bağlanmak için sohbet penceresindeki yönlendirmeleri kullanabilirsiniz.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
