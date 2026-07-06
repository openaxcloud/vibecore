import { Download, Mail } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Button } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Card } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function DPA() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-dpa">
      <PublicNavbar />

      <section className="py-responsive">
        <div className="container-responsive">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-responsive-2xl font-bold tracking-tight mb-4" data-testid="heading-dpa">
              Data Processing Agreement
            </h1>

            <p className="text-responsive-base text-muted-foreground mb-8">
              This Data Processing Agreement ("DPA") forms part of the Contract for Services ("Principal Agreement")
              between E-Code and Customer.
            </p>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">1. Definitions</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  <strong>"Data Controller"</strong> means the entity which determines the purposes and means of the
                  Processing of Personal Data.
                </p>
                <p>
                  <strong>"Data Processor"</strong> means the entity which Processes Personal Data on behalf of the Data
                  Controller.
                </p>
                <p>
                  <strong>"GDPR"</strong> means the General Data Protection Regulation (EU) 2016/679.
                </p>
                <p>
                  <strong>"Personal Data"</strong> means any information relating to an identified or identifiable
                  natural person.
                </p>
                <p>
                  <strong>"Processing"</strong> means any operation performed on Personal Data.
                </p>
                <p>
                  <strong>"Sub-processor"</strong> means any person appointed by or on behalf of Processor to Process
                  Personal Data on behalf of the Customer.
                </p>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">2. Processing of Personal Data</h2>
              <div className="space-y-4 text-[13px]">
                <h3 className="font-semibold text-base">2.1 Roles of the Parties</h3>
                <p>
                  The parties acknowledge and agree that with regard to the Processing of Personal Data, Customer is the
                  Data Controller, E-Code is the Data Processor.
                </p>

                <h3 className="font-semibold text-base mt-6">2.2 Customer's Processing Instructions</h3>
                <p>E-Code shall Process Personal Data only on documented instructions from Customer.</p>

                <h3 className="font-semibold text-base mt-6">2.3 Purpose Limitation</h3>
                <p>E-Code shall Process the Personal Data only for the purposes described in Annex 1.</p>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">3. E-Code Personnel</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  E-Code shall ensure that its personnel engaged in the Processing of Personal Data are informed of the
                  confidential nature of the Personal Data, have received appropriate training, and have executed
                  written confidentiality agreements.
                </p>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">4. Security</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  E-Code shall implement and maintain appropriate technical and organizational measures to protect
                  Personal Data against accidental or unlawful destruction, loss, alteration, unauthorized disclosure or
                  access.
                </p>

                <h3 className="font-semibold text-base mt-6">Security measures include:</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Encryption of Personal Data in transit and at rest</li>
                  <li>Regular security assessments and penetration testing</li>
                  <li>Access controls and authentication mechanisms</li>
                  <li>Regular backups and disaster recovery procedures</li>
                  <li>Employee security training and awareness programs</li>
                </ul>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">5. Sub-processors</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  Customer acknowledges and agrees that E-Code may engage third-party Sub-processors in connection with
                  the provision of the Services.
                </p>
                <p>
                  E-Code maintains a list of current Sub-processors at{' '}
                  <a href="/subprocessors" className="text-primary hover:underline">
                    e-code.ai/subprocessors
                  </a>
                  .
                </p>
                <p>
                  E-Code shall notify Customer of any intended changes concerning the addition or replacement of
                  Sub-processors, giving Customer the opportunity to object to such changes.
                </p>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">6. Data Subject Rights</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  E-Code shall assist Customer in fulfilling its obligations to respond to data subjects' requests to
                  exercise their rights under applicable data protection laws, including:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access to their Personal Data</li>
                  <li>Rectification of Personal Data</li>
                  <li>Erasure of Personal Data</li>
                  <li>Data portability</li>
                  <li>Restriction of Processing</li>
                  <li>Objection to Processing</li>
                </ul>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">7. Personal Data Breach</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  E-Code shall notify Customer without undue delay after becoming aware of a Personal Data Breach
                  affecting Customer Personal Data, providing Customer with sufficient information to allow it to meet
                  any obligations to report or inform Data Subjects of the Personal Data Breach.
                </p>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">
                8. Data Protection Impact Assessment and Prior Consultation
              </h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  E-Code shall provide reasonable assistance to Customer with any data protection impact assessments and
                  prior consultations with supervising authorities, which Customer reasonably considers to be required
                  by applicable data protection laws.
                </p>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">9. Deletion or Return of Personal Data</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  Upon termination of the Services, E-Code shall, at Customer's option, delete or return all Personal
                  Data to Customer and delete existing copies unless applicable law requires storage of the Personal
                  Data.
                </p>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">10. Audit Rights</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  E-Code shall make available to Customer all information necessary to demonstrate compliance with this
                  DPA and allow for and contribute to audits, including inspections, conducted by Customer or an auditor
                  mandated by Customer.
                </p>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">11. International Transfers</h2>
              <div className="space-y-4 text-[13px]">
                <p>
                  E-Code shall not transfer Personal Data to countries outside the European Economic Area without
                  Customer's prior written consent and appropriate safeguards in place, such as:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Standard Contractual Clauses</li>
                  <li>Adequacy decisions</li>
                  <li>Binding Corporate Rules</li>
                  <li>Other legally recognized transfer mechanisms</li>
                </ul>
              </div>
            </Card>

            <Card className="p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-6">Annex 1: Details of Processing</h2>
              <div className="space-y-6 text-[13px]">
                <div>
                  <h3 className="font-semibold mb-2">Nature and Purpose of Processing</h3>
                  <p>
                    E-Code will Process Personal Data as necessary to provide the Services pursuant to the Principal
                    Agreement.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Duration of Processing</h3>
                  <p>
                    E-Code will Process Personal Data for the duration of the Principal Agreement, unless otherwise
                    agreed in writing.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Categories of Data Subjects</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Customer's end users</li>
                    <li>Customer's employees</li>
                    <li>Customer's contractors</li>
                    <li>Customer's business partners</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Types of Personal Data</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Names and contact information</li>
                    <li>Account credentials</li>
                    <li>Usage data and analytics</li>
                    <li>Content created within the Services</li>
                    <li>Payment information (processed by third-party payment processors)</li>
                  </ul>
                </div>
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                asChild
                className="flex items-center gap-2 min-h-[44px]"
                data-testid="button-dpa-download"
              >
                <a href="mailto:legal@e-code.ai?subject=Request%20for%20Data%20Processing%20Agreement%20(DPA)">
                  <Download className="h-4 w-4" />
                  Download PDF
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="flex items-center gap-2 min-h-[44px]"
                data-testid="button-dpa-contact-legal"
              >
                <a href="mailto:legal@e-code.ai?subject=DPA%20Inquiry">
                  <Mail className="h-4 w-4" />
                  Contact Legal
                </a>
              </Button>
            </div>

            <div className="mt-8 p-4 bg-muted rounded-lg">
              <p className="text-[13px] text-muted-foreground">
                <strong>Last Updated:</strong> {LEGAL_DATES.dpa}
                <br />
                <strong>Effective Date:</strong> Upon execution of the Principal Agreement
                <br />
                For questions about this DPA, please contact our Data Protection Officer at{' '}
                <a href="mailto:privacy@e-code.ai" className="text-primary hover:underline">
                  privacy@e-code.ai
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
