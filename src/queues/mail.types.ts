export type TemplateMailJob = {
  kind: "template";
  to: string | string[];
  subject: string;
  templateId: string;
  variables: Record<string, string | number>;
};

export type ReservationStatusMailJob = {
  kind: "reservation-status";
  to: string;
  params: {
    contactName: string;
    reference: string;
    status: string;
    statusText: string;
    statusReason?: string;
    statusMessage: string;
    appointmentDate: string;
    appointmentTime: string;
    deviceType: string;
    service: string;
    detailUrl: string;
  };
};

export type MailJobData = TemplateMailJob | ReservationStatusMailJob;
