export const querySales = (params: any) => {
  return `
     SELECT
     sh.idShipment,
        o.idOrder,
        o.userId,
        COUNT(s.idSale) AS totalSales,
        SUM(s.total) AS totalAmount,
        o.pay_method,
        p.idProduct,
        p.name,
        p.description,
        p.price,
        p.image_url,
        s.quantity,
        o.createdAt,
        s.status,
         o.stripePaymentIntentId,
          sh.status AS statusEnvio,
          o.paidAtOxxo,
          o.shipping_method,
          ad.street,
          ad.noExt,
          ad.noInt,
          ad.cologne,
          ad.city,
          ad.state,
          ad.country

      FROM
        pcinbox_db.order o
      INNER JOIN
        pcinbox_db.sales s ON o.idOrder = s.orderId
        INNER JOIN pcinbox_db.products p ON s.productId = p.idProduct
          INNER JOIN
      pcinbox_db.shipments sh ON o.idOrder = sh.orderId

      INNER JOIN addresses ad ON  sh.addressId  = ad.idAddress
	

      WHERE
        o.userId = ${params.idUser}
    GROUP BY
    o.idOrder, o.userId, o.pay_method, p.price, p.image_url, o.createdAt, p.description, p.name, s.quantity, s.status, o.stripePaymentIntentId,
    sh.status,p.idProduct,o.paidAtOxxo,o.shipping_method,
     ad.street,
          ad.noExt,
          ad.noInt,
          ad.cologne,
          ad.city,
          ad.state,
          ad.country,
          sh.idShipment

      ORDER BY
        o.idOrder DESC;
    
    `;
};

export const querySalesWithOrder = (idUser: any, idOrder: any) => {
  return `
  SELECT 
      o.idOrder,   
      o.userId,
      COUNT(s.idSale) AS totalSales,
      SUM(s.total) AS totalAmount,
      o.pay_method,
      p.name,
      p.description,
      p.price,
      p.image_url,
      s.quantity,
      o.createdAt,
      o.status,
      o.paidAtOxxo,
      sh.createdAt as updatedAt

    FROM 
      pcinbox_db.order o
    INNER JOIN 
      pcinbox_db.sales s ON o.idOrder = s.orderId
      INNER JOIN pcinbox_db.products p ON s.productId = p.idProduct  
  
      INNER JOIN pcinbox_db.shipments sh ON o.idOrder = sh.orderId

    WHERE 
      o.userId = ${idUser} and o.idOrder = ${idOrder}
  GROUP BY 
  o.idOrder, o.userId, o.pay_method, p.price, p.image_url, o.createdAt, p.description, p.name, s.quantity, o.status,
  o.paidAtOxxo, sh.createdAt
    ORDER BY 
      o.idOrder DESC;
  `;
};

export const querySalesWithStatus = (idUser: any, status: any) => {
  const query = `
SELECT
sh.idShipment,
  o.idOrder,
  o.userId,
  COUNT(s.idSale) AS totalSales,
  SUM(s.total) AS totalAmount,
  o.pay_method,
  p.idProduct,
  p.name,
  p.description,
  p.price,
  p.image_url,
  s.quantity,
  o.createdAt,
  o.updatedAt,
  s.status,
  o.stripePaymentIntentId,
  sh.status AS statusEnvio,
  o.paidAtOxxo,
  a.street as street,
  a.noExt as noExt,
   a.noInt,
  a.cologne,
  a.city,
   a.state,
  a.country,
  o.shipping_method
FROM
  pcinbox_db.order o
INNER JOIN
  pcinbox_db.sales s ON o.idOrder = s.orderId
INNER JOIN
  pcinbox_db.products p ON s.productId = p.idProduct
INNER JOIN
  pcinbox_db.shipments sh ON o.idOrder = sh.orderId
  
  LEFT JOIN pcinbox_db.addresses a ON sh.addressId = a.idAddress 

WHERE
  o.userId = ${Number(idUser)} 
  ${status !== "allState" ? `AND sh.status = "${status}"` : ""}
  AND o.pay_method != "esperando"
  
GROUP BY
sh.idShipment,
  o.idOrder, 
  o.userId, 
  o.pay_method, 
  p.idProduct, 
  p.name, 
  p.description, 
  p.price, 
  p.image_url, 
  s.quantity, 
  s.status, 
  o.createdAt, 
  o.stripePaymentIntentId, 
  sh.status,
  o.paidAtOxxo,
  o.shipping_method,
   o.updatedAt
ORDER BY
  o.idOrder DESC;
`;
  return query;
};
