const PDFDocument = require('pdfkit');
const fs = require('fs');

/**
 * Generates an executive, perfectly fitted 1-Page PDF Resume matching Santhosh's exact typography and styling.
 * Balanced to fill the entire page gracefully from top to bottom without trailing blanks or spillovers.
 */
function generateResumePdf(resumeJson, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 22,
          bottom: 15,
          left: 38,
          right: 38
        },
        bufferPages: true,
        autoFirstPage: true
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const textColor = '#000000';
      const grayLineColor = '#333333';
      const leftMargin = 38;
      const rightMargin = 557; // 595 - 38
      const contentWidth = rightMargin - leftMargin; // 519

      function drawSectionHeader(title) {
        doc.x = leftMargin;
        doc.moveDown(0.28);
        doc.font('Helvetica-Bold')
           .fontSize(9.2)
           .fillColor(textColor)
           .text(title.toUpperCase(), leftMargin, doc.y, { width: contentWidth });
        
        const lineY = doc.y + 1;
        doc.strokeColor(grayLineColor)
           .lineWidth(0.6)
           .moveTo(leftMargin, lineY)
           .lineTo(rightMargin, lineY)
           .stroke();
        
        doc.y = lineY + 3;
        doc.x = leftMargin;
      }

      // --- 1. HEADER (Name & 2-Column Contact Info) ---
      const info = resumeJson.personalInfo || {};

      doc.font('Helvetica-Bold')
         .fontSize(14)
         .fillColor(textColor)
         .text((info.name || 'SANTHOSH T K').toUpperCase(), leftMargin, doc.y, { align: 'center', width: contentWidth });
      doc.moveDown(0.15);

      const headerTopY = doc.y;

      // Left Column
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text('Location: ', leftMargin, headerTopY, { continued: true });
      doc.font('Helvetica').text(info.location || 'Bangalore');

      doc.font('Helvetica-Bold').fontSize(8.5).text('Email: ', leftMargin, doc.y, { continued: true });
      doc.font('Helvetica').text(info.email || 'tksanthosh494@gmail.com');

      if (info.portfolio) {
        doc.font('Helvetica-Bold').fontSize(8.5).text('Portfolio: ', leftMargin, doc.y, { continued: true });
        doc.font('Helvetica').text(info.portfolio);
      }

      // Right Column
      const rightColX = 310;
      doc.font('Helvetica-Bold').fontSize(8.5).text('Phone: ', rightColX, headerTopY, { continued: true });
      doc.font('Helvetica').text(info.phone || '+91 8825802707');

      doc.font('Helvetica-Bold').fontSize(8.5).text('LinkedIn: ', rightColX, doc.y, { continued: true });
      doc.font('Helvetica').text(info.linkedin || 'linkedin.com/in/santhosh-tk');

      doc.font('Helvetica-Bold').fontSize(8.5).text('GitHub: ', rightColX, doc.y, { continued: true });
      doc.font('Helvetica').text(info.github || 'github.com/TKSanthosh');

      doc.y = headerTopY + 36;
      doc.x = leftMargin;

      // --- 2. PROFILE SUMMARY ---
      if (resumeJson.summary) {
        drawSectionHeader('Profile Summary');
        doc.font('Helvetica')
           .fontSize(8.5)
           .fillColor(textColor)
           .text(resumeJson.summary, leftMargin, doc.y, {
             width: contentWidth,
             align: 'left',
             lineGap: 1.5
           });
      }

      // --- 3. TECHNICAL SKILLS ---
      if (resumeJson.skills && Object.keys(resumeJson.skills).length > 0) {
        drawSectionHeader('Technical Skills');
        Object.entries(resumeJson.skills).forEach(([category, skillsList]) => {
          const listStr = Array.isArray(skillsList) ? skillsList.join(', ') : skillsList;
          doc.x = leftMargin;
          doc.font('Helvetica-Bold')
             .fontSize(8.5)
             .fillColor(textColor)
             .text(category + ': ', leftMargin, doc.y, { continued: true });
          
          doc.font('Helvetica')
             .fontSize(8.5)
             .fillColor(textColor)
             .text(listStr, { width: contentWidth, lineGap: 1.2 });
          doc.moveDown(0.12);
        });
      }

      // --- 4. PROFESSIONAL EXPERIENCE ---
      if (resumeJson.experience && resumeJson.experience.length > 0) {
        drawSectionHeader('Professional Experience');
        resumeJson.experience.forEach(job => {
          doc.x = leftMargin;
          
          // Line 1: Role and Duration
          doc.font('Helvetica-Bold')
             .fontSize(8.8)
             .fillColor(textColor)
             .text(job.role, leftMargin, doc.y, { continued: true, width: contentWidth });
          
          if (job.duration) {
            doc.font('Helvetica')
               .fontSize(8.5)
               .fillColor(textColor)
               .text('   |   ' + job.duration);
          } else {
            doc.text('');
          }

          // Line 2: Company
          doc.font('Helvetica-Bold')
             .fontSize(8.5)
             .fillColor(textColor)
             .text(job.company, leftMargin, doc.y, { width: contentWidth });

          // Single Project
          if (job.project) {
            doc.font('Helvetica-Bold')
               .fontSize(8.5)
               .fillColor(textColor)
               .text(job.project, leftMargin, doc.y, { width: contentWidth });
          }

          if (job.highlights && Array.isArray(job.highlights)) {
            job.highlights.forEach(bullet => {
              doc.font('Helvetica')
                 .fontSize(8.4)
                 .fillColor(textColor)
                 .text('•  ' + bullet, leftMargin, doc.y, { indent: 8, width: contentWidth, lineGap: 1.2 });
              doc.moveDown(0.06);
            });
          }

          // Sub-Projects
          if (job.projects && Array.isArray(job.projects)) {
            job.projects.forEach(subProj => {
              doc.x = leftMargin;
              doc.font('Helvetica-Bold')
                 .fontSize(8.5)
                 .fillColor(textColor)
                 .text(subProj.name || subProj.title, leftMargin, doc.y, { width: contentWidth });

              if (subProj.highlights) {
                subProj.highlights.forEach(bullet => {
                  doc.font('Helvetica')
                     .fontSize(8.4)
                     .fillColor(textColor)
                     .text('•  ' + bullet, leftMargin, doc.y, { indent: 8, width: contentWidth, lineGap: 1.2 });
                  doc.moveDown(0.06);
                });
              }
            });
          }
          doc.moveDown(0.08);
        });
      }

      // --- 5. KEY ACHIEVEMENTS ---
      if (resumeJson.achievements && resumeJson.achievements.length > 0) {
        drawSectionHeader('Key Achievements');
        resumeJson.achievements.forEach(ach => {
          doc.x = leftMargin;
          doc.font('Helvetica')
             .fontSize(8.4)
             .fillColor(textColor)
             .text('•  ' + ach, leftMargin, doc.y, { indent: 8, width: contentWidth, lineGap: 1.2 });
          doc.moveDown(0.06);
        });
      }

      // --- 6. INTERNSHIP EXPERIENCE ---
      if (resumeJson.internship) {
        drawSectionHeader('Internship Experience');
        doc.x = leftMargin;
        doc.font('Helvetica-Bold')
           .fontSize(8.8)
           .fillColor(textColor)
           .text(resumeJson.internship.role + ' - ' + resumeJson.internship.company, leftMargin, doc.y, { continued: true, width: contentWidth });

        if (resumeJson.internship.duration) {
          doc.font('Helvetica')
             .fontSize(8.5)
             .fillColor(textColor)
             .text('   |   ' + resumeJson.internship.duration);
        } else {
          doc.text('');
        }

        if (resumeJson.internship.highlights) {
          resumeJson.internship.highlights.forEach(bullet => {
            doc.font('Helvetica')
               .fontSize(8.4)
               .fillColor(textColor)
               .text('•  ' + bullet, leftMargin, doc.y, { indent: 8, width: contentWidth, lineGap: 1.2 });
            doc.moveDown(0.06);
          });
        }
      }

      // --- 7. EDUCATION ---
      if (resumeJson.education && resumeJson.education.length > 0) {
        drawSectionHeader('Education');
        resumeJson.education.forEach(edu => {
          doc.x = leftMargin;
          doc.font('Helvetica-Bold')
             .fontSize(8.5)
             .fillColor(textColor)
             .text(edu.degree, leftMargin, doc.y, { continued: true, width: contentWidth });

          const eduMeta = [edu.institution, edu.duration, edu.details].filter(Boolean).join('   |   ');
          doc.font('Helvetica')
             .fontSize(8.5)
             .fillColor(textColor)
             .text('   |   ' + eduMeta);
        });
      }

      // --- 8. ATS KEYWORDS LAYER (Strict 1-Page with zero margin overflow) ---
      if (resumeJson.atsKeywords && Array.isArray(resumeJson.atsKeywords) && resumeJson.atsKeywords.length > 0) {
        const atsText = resumeJson.atsKeywords.join(' • ');
        doc.page.margins.bottom = 0;
        doc.fontSize(3)
           .fillColor('#ffffff')
           .text(atsText, leftMargin, 832, { width: contentWidth, lineBreak: false });
      }

      doc.end();

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateResumePdf };
